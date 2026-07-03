from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import os
from openai import OpenAI

# Initialize client using environment variable OPENAI_API_KEY
client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', 'mock-key'))

class TranscribeAudioView(APIView):
    def post(self, request):
        if 'audio' not in request.FILES:
            return Response({"error": "No audio file provided"}, status=status.HTTP_400_BAD_REQUEST)
        
        audio_file = request.FILES['audio']
        
        try:
            transcript = client.audio.transcriptions.create(
                model="whisper-1", 
                file=audio_file
            )
            text = transcript.text
            
            prompt = (
                "Extrae los problemas reportados del siguiente texto o transcripción de audio "
                "y devuélvelos como una lista clara de puntos (bullet points):\n\n"
                f"{text}"
            )
            
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Eres un asistente de taller mecánico experto en diagnosticar problemas vehiculares de forma concisa."},
                    {"role": "user", "content": prompt}
                ]
            )
            
            issues = completion.choices[0].message.content
            
            return Response({"issues": issues}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GenerateDiagnosisView(APIView):
    def post(self, request):
        notes = request.data.get('notes', '')
        if not notes:
            return Response({"error": "Notes are required"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            prompt = (
                "Basado en las siguientes notas y problemas reportados del vehículo:\n"
                f"{notes}\n\n"
                "Genera un diagnóstico técnico preliminar y recomienda 3 a 5 servicios "
                "específicos que deberían realizarse para solucionar estos problemas. "
                "Formatea la respuesta claramente."
            )
            
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Eres un mecánico maestro experto. Da respuestas profesionales, técnicas pero comprensibles."},
                    {"role": "user", "content": prompt}
                ]
            )
            
            diagnosis = completion.choices[0].message.content
            
            diagnosis = completion.choices[0].message.content
            
            return Response({"diagnosis": diagnosis}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WhatsAppAgentView(APIView):
    """
    Procesa mensajes entrantes de WhatsApp y genera una respuesta usando OpenAI (GPT-4o-mini)
    con contexto del taller, del cliente y de sus vehículos.
    """
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        number = request.data.get('number', '').strip()
        text = request.data.get('text', '').strip()

        if not number or not text:
            return Response({"error": "Number and text are required"}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Limpiar número telefónico para match (ej: remover @s.whatsapp.net o signos)
        clean_num = number.replace('@s.whatsapp.net', '')
        if not clean_num.startswith('+'):
            # Baileys usualmente entrega el número sin el '+'
            clean_num = '+' + clean_num

        # Buscar cliente por teléfono (flexibilidad de búsqueda con/sin +)
        from operations.models import Client, WorkshopSettings, WorkOrder
        client_obj = Client.objects.filter(phone__icontains=clean_num[-8:]).first()

        # 2. Recolectar contexto del cliente y vehículos
        client_context = "Cliente: Anónimo / No registrado.\n"
        if client_obj:
            client_context = (
                f"Cliente identificado: {client_obj.first_name} {client_obj.last_name}\n"
                f"Teléfono: {client_obj.phone}\n"
                f"Portal de Clientes habilitado: {'Sí' if client_obj.portal_enabled else 'No'}\n"
            )
            vehicles = client_obj.vehicles.all()
            if vehicles.exists():
                client_context += "Vehículos registrados:\n"
                for v in vehicles:
                    client_context += f"- {v.make} {v.model} ({v.year}) - Patente: {v.license_plate}\n"
                    # OTs activas
                    active_ots = WorkOrder.objects.filter(vehicle=v).exclude(status__in=['DELIVERED', 'CANCELLED'])
                    if active_ots.exists():
                        client_context += "  Órdenes en curso:\n"
                        for ot in active_ots:
                            client_context += f"    * OT-{ot.id}: Estado: {ot.get_status_display()} | Síntomas: {ot.symptoms or 'N/A'}\n"
            else:
                client_context += "No tiene vehículos registrados a su nombre aún.\n"

        # 3. Contexto del Taller (WorkshopSettings)
        workshop = WorkshopSettings.load()
        workshop_context = (
            f"Taller: {workshop.name or 'MecanIA'}\n"
            f"Dirección: {workshop.address or 'No especificada'}\n"
            f"Teléfono de contacto: {workshop.phone or 'No especificado'}\n"
            f"Email: {workshop.email or 'No especificado'}\n"
            f"Sitio Web: {workshop.website or 'No especificado'}\n"
        )

        # 4. Construir System Prompt
        system_prompt = f"""
        Eres 'MecanIA Bot', el agente inteligente de ventas y atención automatizada de {workshop.name or 'MecanIA'}.
        Tu labor es asistir a los clientes de forma muy amable, profesional y rápida vía WhatsApp.

        Contexto del Taller:
        {workshop_context}

        Información del Cliente con el que estás hablando:
        {client_context}

        Reglas de comportamiento y respuestas:
        1. **Saludos e Identificación**: Si el cliente está identificado por su nombre, saludalo cordialmente usando su nombre (ej: "Hola Juan..."). Si no está registrado, se amable y dale la bienvenida a MecanIA.
        2. **Información General**: Responde preguntas sobre nuestra dirección, horarios o datos de contacto basándote únicamente en el Contexto del Taller.
        3. **Agendar Horas / Cotizar**: Si el cliente quiere pedir una hora o cotizar un servicio/presupuesto, solicita amablemente los siguientes datos si no los ha dado:
           - Patente, Marca y Modelo del vehículo.
           - Síntoma o servicio que requiere.
           Indícale que has registrado su solicitud de revisión y que un asesor técnico se comunicará con él en breves minutos para confirmar la fecha y hora.
        4. **Estado de Reparaciones**: Si pregunta por el estado de su vehículo y tiene OTs activas, dale un resumen muy breve y explícale que puede ver fotos, repuestos instalados y el avance en tiempo real en nuestro Portal de Clientes.
           - Si el cliente tiene el portal activo, proporciónale el link del portal: {workshop.website or 'taller'}/client y recuérdale que puede ingresar con su teléfono.
        5. **Tono**: Sé conciso (máximo 2-3 párrafos cortos por respuesta). Usa emojis de forma moderada para ser amigable.
        """

        try:
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text}
                ],
                max_tokens=400,
                temperature=0.6
            )
            reply = completion.choices[0].message.content
            return Response({"reply": reply}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": f"Error de IA: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


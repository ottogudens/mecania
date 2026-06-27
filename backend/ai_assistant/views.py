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
            # En un entorno real, descomentar esto si se tiene la API Key
            # transcript = client.audio.transcriptions.create(
            #     model="whisper-1", 
            #     file=audio_file
            # )
            # text = transcript.text
            
            # Mock de respuesta por ahora para no consumir créditos o fallar sin Key
            text = "El vehículo presenta un ruido metálico en la zona del motor al acelerar. Las pastillas de freno están desgastadas al 80%."
            
            return Response({"transcription": text}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GenerateDiagnosisView(APIView):
    def post(self, request):
        notes = request.data.get('notes', '')
        if not notes:
            return Response({"error": "Notes are required"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # En un entorno real, usar la API
            # response = client.chat.completions.create(
            #     model="gpt-4",
            #     messages=[
            #         {"role": "system", "content": "Eres un experto mecánico automotriz. Genera un reporte técnico profesional para el cliente basado en estas notas."},
            #         {"role": "user", "content": notes}
            #     ]
            # )
            # diagnosis = response.choices[0].message.content
            
            # Mock de respuesta
            diagnosis = "REPORTE TÉCNICO PROFESIONAL:\n\n1. Hallazgos en Motor: Se detecta ruido metálico inusual. Posible falla en la cadena de distribución o taqués. Requiere revisión profunda.\n2. Frenos: Se recomienda reemplazo urgente de pastillas de freno delanteras (80% de desgaste actual) por seguridad."
            
            return Response({"diagnosis": diagnosis}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from django.contrib.auth import authenticate
from django.http import HttpResponse
import io
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from rest_framework.authtoken.models import Token
import requests
import os
from openai import OpenAI
from .models import Client, Vehicle, WorkOrder, WorkOrderItem, VisualInspection, WorkshopSettings
from .serializers import ClientSerializer, VehicleSerializer, WorkOrderSerializer, WorkOrderItemSerializer, VisualInspectionSerializer, WorkshopSettingsSerializer
from .services import transition_work_order_status, cancel_work_order, WorkOrderTransitionError

class ClientViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Client.objects.all().order_by('-id')
    serializer_class = ClientSerializer

class VehicleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Vehicle.objects.all().order_by('-id')
    serializer_class = VehicleSerializer

class WorkOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = WorkOrder.objects.all().order_by('-created_at')
    serializer_class = WorkOrderSerializer

    def update(self, request, *args, **kwargs):
        """
        Bloquea el cambio directo de 'status' vía PUT/PATCH genérico. Todo
        cambio de estado debe pasar por la acción change_status, que aplica
        la validación de evidencia obligatoria y el descuento de inventario.
        Otros campos (kilometraje, mecánico asignado, etc.) sí se pueden
        editar normalmente por esta vía.
        """
        if 'status' in request.data:
            return Response(
                {
                    'error': "No se puede cambiar 'status' directamente. "
                             "Usa POST /api/operations/work-orders/{id}/change_status/ "
                             "con {'status': '<nuevo_estado>'}."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def change_status(self, request, pk=None):
        """
        Único endpoint autorizado para avanzar/cambiar el estado de una OT.
        Aplica la regla de evidencia obligatoria en hallazgos críticos y,
        al completar/entregar, descuenta inventario en una transacción
        atómica (ver operations/services.py).
        """
        work_order = self.get_object()
        new_status = request.data.get('status')
        if not new_status:
            return Response({'error': "Debes indicar 'status'."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            transition_work_order_status(work_order=work_order, new_status=new_status, user=request.user)
        except WorkOrderTransitionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(WorkOrderSerializer(work_order).data)

    @action(detail=True, methods=['post'])
    def take_order(self, request, pk=None):
        work_order = self.get_object()
        if work_order.status != 'PENDING':
            return Response({'error': 'La orden de trabajo ya no está pendiente.'}, status=status.HTTP_400_BAD_REQUEST)
        
        work_order.mechanic = request.user
        work_order.status = 'IN_PROGRESS'
        work_order.save()
        return Response(WorkOrderSerializer(work_order).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancela la OT (no aplica si ya fue entregada al cliente)."""
        work_order = self.get_object()
        reason = request.data.get('reason', '')
        try:
            cancel_work_order(work_order=work_order, reason=reason)
        except WorkOrderTransitionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(WorkOrderSerializer(work_order).data)

    @action(detail=True, methods=['post'])
    def notify_client(self, request, pk=None):
        work_order = self.get_object()
        client = work_order.vehicle.client
        
        if not client or not client.phone:
            return Response({'error': 'El vehículo no tiene un cliente asignado con teléfono válido.'}, status=status.HTTP_400_BAD_REQUEST)
        
        message = request.data.get('message', f"Hola {client.first_name}, tu vehículo {work_order.vehicle.license_plate} tiene una actualización. Estado: {work_order.get_status_display()}")
        
        try:
            # En producción, configurar la variable de entorno WHATSAPP_SERVICE_URL (ej: https://whatsapp-production.up.railway.app)
            base_whatsapp_url = os.environ.get('WHATSAPP_SERVICE_URL', 'http://localhost:3001')
            whatsapp_service_url = f"{base_whatsapp_url.rstrip('/')}/api/send-message"
            
            response = requests.post(whatsapp_service_url, json={
                "number": client.phone,
                "text": message
            })
            
            if response.status_code == 200:
                return Response({'success': True, 'message': 'Notificación enviada vía WhatsApp.'})
            else:
                return Response({'error': 'Fallo al enviar notificación al microservicio.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            return Response({'error': f'Error de conexión con microservicio: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def send_findings_whatsapp(self, request, pk=None):
        work_order = self.get_object()
        client = work_order.vehicle.client
        
        if not client or not client.phone:
            return Response({'error': 'El vehículo no tiene un cliente asignado con teléfono válido.'}, status=status.HTTP_400_BAD_REQUEST)
        
        findings = work_order.additional_findings
        if not findings:
            return Response({'error': 'No hay hallazgos adicionales registrados en esta OT.'}, status=status.HTTP_400_BAD_REQUEST)
            
        message = (
            f"Hola {client.first_name}, durante la revisión de tu vehículo {work_order.vehicle.make} {work_order.vehicle.model} "
            f"(Placa: {work_order.vehicle.license_plate}), nuestro mecánico ha identificado el siguiente detalle/problema:\n\n"
            f"\"{findings}\"\n\n"
            f"Por favor, indícanos si apruebas realizar este servicio adicional respondiendo a este mensaje."
        )
        
        try:
            base_whatsapp_url = os.environ.get('WHATSAPP_SERVICE_URL', 'http://localhost:3001')
            whatsapp_service_url = f"{base_whatsapp_url.rstrip('/')}/api/send-message"
            
            response = requests.post(whatsapp_service_url, json={
                "number": client.phone,
                "text": message
            })
            
            if response.status_code == 200:
                return Response({'success': True, 'message': 'Mensaje de hallazgos enviado vía WhatsApp.'})
            else:
                return Response({'error': 'Fallo al enviar notificación al microservicio.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            return Response({'error': f'Error de conexión con microservicio: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def generate_pdf(self, request, pk=None):
        work_order = self.get_object()
        client = work_order.vehicle.client
        vehicle = work_order.vehicle
        items = WorkOrderItem.objects.filter(work_order=work_order)

        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        
        # Header
        from operations.models import WorkshopSettings
        settings = WorkshopSettings.load()
        if settings.logo:
            try:
                import base64
                import io
                from reportlab.lib.utils import ImageReader
                
                # Check if it is a base64 data URL
                if settings.logo.startswith('data:image'):
                    header, data = settings.logo.split(';base64,')
                    decoded = base64.b64decode(data)
                    img = ImageReader(io.BytesIO(decoded))
                    p.drawImage(img, 50, 700, width=100, preserveAspectRatio=True, mask='auto')
            except Exception as e:
                print("PDF Logo drawing failed:", e)
        
        p.setFont("Helvetica-Bold", 24)
        p.drawString(160, 750, settings.name)
        p.setFont("Helvetica", 12)
        p.drawString(160, 730, f"Teléfono: {settings.phone} | Email: {settings.email}")
        p.drawString(160, 715, settings.address)
        
        # Title
        p.setFont("Helvetica-Bold", 16)
        p.drawString(50, 680, f"Orden de Trabajo #{work_order.id}")
        
        # Client and Vehicle Info
        p.setFont("Helvetica", 12)
        client_name = f"{client.first_name} {client.last_name}" if client else "Desconocido"
        p.drawString(50, 650, f"Cliente: {client_name}")
        p.drawString(50, 630, f"Vehículo: {vehicle.make} {vehicle.model} - Patente: {vehicle.license_plate}")
        p.drawString(50, 610, f"Estado: {work_order.get_status_display()}")
        
        # Table Header
        y = 570
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, "Descripción")
        p.drawString(300, y, "Cantidad")
        p.drawString(400, y, "Precio Unitario")
        p.drawString(500, y, "Total")
        p.line(50, y-5, 550, y-5)
        
        # Items
        y -= 25
        p.setFont("Helvetica", 12)
        total_amount = 0
        for item in items:
            item_total = item.quantity * item.unit_price
            total_amount += item_total
            p.drawString(50, y, str(item.description)[:35])
            p.drawString(300, y, str(item.quantity))
            p.drawString(400, y, f"${item.unit_price}")
            p.drawString(500, y, f"${item_total}")
            y -= 20
        
        # Total
        p.line(50, y-5, 550, y-5)
        y -= 25
        p.setFont("Helvetica-Bold", 14)
        p.drawString(400, y, "Total:")
        p.drawString(500, y, f"${total_amount}")
        
        p.showPage()
        p.save()
        
        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="OT_{work_order.id}.pdf"'
        return response

class WorkOrderItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = WorkOrderItem.objects.all().order_by('id')
    serializer_class = WorkOrderItemSerializer

class VisualInspectionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = VisualInspection.objects.all().order_by('-created_at')
    serializer_class = VisualInspectionSerializer

class CustomAuthToken(APIView):
    """Login endpoint — public, no authentication required."""
    permission_classes = []
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        username = request.data.get('username')
        password = request.data.get('password')
        
        user = authenticate(username=username, password=password)
        
        if user is not None:
            token, created = Token.objects.get_or_create(user=user)
            try:
                profile = user.profile
                role = 'admin' if profile.role == 'ADMIN' else 'mechanic'
            except UserProfile.DoesNotExist:
                role = 'admin' if user.is_superuser else 'mechanic'
            
            return Response({
                'token': token.key,
                'role': role,
                'user_id': user.pk,
                'username': user.username
            })
        else:
            return Response({'error': 'Credenciales inválidas'}, status=status.HTTP_401_UNAUTHORIZED)

class WorkshopSettingsView(APIView):
    # Depending on requirements, we might want IsAuthenticated or public access
    # Let's allow authenticated to read/write, or public to read
    # We will just allow any for now for read, and auth for write, or just auth for both
    # The requirement is just to use it for PDFs and show it in settings.
    permission_classes = [IsAuthenticated]

    def get(self, request):
        settings = WorkshopSettings.load()
        serializer = WorkshopSettingsSerializer(settings, context={'request': request})
        return Response(serializer.data)

    def put(self, request):
        settings = WorkshopSettings.load()
        serializer = WorkshopSettingsSerializer(settings, data=request.data, context={'request': request}, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ClientAuthToken(APIView):
    """Client portal login — public endpoint, identifies client by phone."""
    permission_classes = []
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        phone = request.data.get('phone')
        
        clients = Client.objects.filter(phone=phone)
        
        if clients.exists():
            return Response({
                'success': True,
                'message': 'Magic link sent',
                'phone': phone
            })
        else:
            return Response({'error': 'Número de teléfono no encontrado en nuestros registros'}, status=status.HTTP_404_NOT_FOUND)

class ClientDataView(APIView):
    """Client portal data — public endpoint, data scoped to a single phone number."""
    permission_classes = []
    authentication_classes = []

    def get(self, request, *args, **kwargs):
        phone = request.query_params.get('phone')
        if not phone:
            return Response({"error": "Phone number required"}, status=status.HTTP_400_BAD_REQUEST)
            
        client = Client.objects.filter(phone=phone).first()
        if not client:
            return Response({"error": "Client not found"}, status=status.HTTP_404_NOT_FOUND)
            
        vehicles = client.vehicles.all()
        if not vehicles.exists():
            return Response({"error": "No vehicles found"}, status=status.HTTP_404_NOT_FOUND)
            
        data = []
        for vehicle in vehicles:
            active_orders = WorkOrder.objects.filter(vehicle=vehicle).exclude(status='DELIVERED').order_by('-created_at')
            past_orders = WorkOrder.objects.filter(vehicle=vehicle, status='DELIVERED').order_by('-created_at')
            
            orders_data = []
            for order in active_orders:
                orders_data.append({
                    'id': order.id,
                    'status': order.get_status_display(),
                    'raw_status': order.status,
                    'created_at': order.created_at,
                    'service': 'Mantenimiento General'
                })
                
            past_orders_data = []
            for order in past_orders:
                past_orders_data.append({
                    'id': order.id,
                    'status': order.get_status_display(),
                    'raw_status': order.status,
                    'created_at': order.created_at,
                    'service': 'Mantenimiento General'
                })
                
            data.append({
                'vehicle': {
                    'make': vehicle.make,
                    'model': vehicle.model,
                    'license_plate': vehicle.license_plate
                },
                'active_orders': orders_data,
                'past_orders': past_orders_data
            })
            
            
        return Response(data)

class AIDiagnosticsView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        work_order_id = request.data.get('work_order_id')
        
        if work_order_id:
            try:
                work_order = WorkOrder.objects.select_related('vehicle').get(id=work_order_id)
                vehicle = work_order.vehicle
                symptoms = work_order.symptoms or "No especificado"
                visit_reason = work_order.visit_reason or "No especificado"
                desired_service = work_order.desired_service or "No especificado"
                
                vehicle_info = (
                    f"Vehículo: {vehicle.make} {vehicle.model} ({vehicle.year})\n"
                    f"Transmisión: {vehicle.get_transmission_type_display()}\n"
                    f"Combustible: {vehicle.get_fuel_type_display()}\n"
                    f"Cilindrada: {vehicle.engine_displacement or 'No especificado'}\n"
                    f"Kilometraje OT: {work_order.mileage} km"
                )
            except WorkOrder.DoesNotExist:
                return Response({'error': 'Orden de trabajo no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            symptoms = request.data.get('symptoms')
            visit_reason = request.data.get('visit_reason', 'No especificado')
            desired_service = request.data.get('desired_service', 'No especificado')
            vehicle_info = request.data.get('vehicle_info', 'Vehículo: No especificado')
            
            if not symptoms:
                return Response({'error': 'Por favor, describe los síntomas del vehículo.'}, status=status.HTTP_400_BAD_REQUEST)
                
        try:
            client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
            
            prompt = f"""
            Eres 'MecanIA', un experto mecánico automotriz con décadas de experiencia.
            
            Información del Vehículo:
            {vehicle_info}
            
            Datos de la Orden de Trabajo / Visita:
            - Motivo de la visita: {visit_reason}
            - Servicio solicitado: {desired_service}
            - Síntomas reportados: {symptoms}
            
            Proporciona un pre-diagnóstico técnico estructurado (máximo 4 párrafos), indicando las posibles causas,
            los componentes específicos a revisar, y sugerencias de mantenimiento basadas en los datos técnicos del vehículo.
            Usa un tono profesional, claro y amable.
            """
            
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Eres un asistente mecánico experto."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=600,
                temperature=0.7
            )
            
            ai_message = response.choices[0].message.content
            return Response({'diagnosis': ai_message})
            
        except Exception as e:
            print("Error OpenAI:", str(e))
            return Response({'error': 'Error al conectar con la Inteligencia Artificial.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class AITranscribeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        audio_file = request.FILES.get('audio')
        if not audio_file:
            return Response({'error': 'No se proporcionó ningún archivo de audio.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
            
            # Pass file as tuple to preserve filename extension for Whisper api
            file_data = (audio_file.name, audio_file.read(), audio_file.content_type)
            
            transcription = client.audio.transcriptions.create(
              model="whisper-1", 
              file=file_data,
              language="es"
            )
            
            return Response({'transcription': transcription.text})
            
        except Exception as e:
            print("Error OpenAI Whisper:", str(e))
            return Response({'error': f'Error al transcribir el audio: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

from django.utils import timezone
from django.db.models import Sum, Count
from datetime import timedelta

class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start_of_week = start_of_day - timedelta(days=start_of_day.weekday())
        start_of_month = start_of_day.replace(day=1)

        # Sales Calculations from payments
        from finance.models import Payment
        sales_day = Payment.objects.filter(date__gte=start_of_day).aggregate(total=Sum('amount'))['total'] or 0
        sales_week = Payment.objects.filter(date__gte=start_of_week).aggregate(total=Sum('amount'))['total'] or 0
        sales_month = Payment.objects.filter(date__gte=start_of_month).aggregate(total=Sum('amount'))['total'] or 0

        # OT States
        ot_stats = WorkOrder.objects.values('status').annotate(count=Count('id'))
        ot_status_counts = {stat['status']: stat['count'] for stat in ot_stats}

        # Most Visited Brands/Models
        vehicles_visited = Vehicle.objects.annotate(
            visits=Count('work_orders')
        ).filter(visits__gt=0).order_by('-visits')[:5]
        
        most_visited_vehicles = [{
            'make': v.make,
            'model': v.model,
            'visits': v.visits
        } for v in vehicles_visited]

        # Most Sold Products / Services
        most_sold_items = WorkOrderItem.objects.values('description').annotate(
            total_qty=Sum('quantity')
        ).order_by('-total_qty')[:5]

        items_sold = [{
            'description': item['description'],
            'quantity': float(item['total_qty']),
        } for item in most_sold_items]

        return Response({
            'sales': {
                'day': float(sales_day),
                'week': float(sales_week),
                'month': float(sales_month),
            },
            'ot_status': ot_status_counts,
            'most_visited_vehicles': most_visited_vehicles,
            'most_sold_items': items_sold
        })

from django.contrib.auth.models import User
from rest_framework import serializers

class UserSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source='profile.role', required=False)
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'password']
        extra_kwargs = {'password': {'write_only': True, 'required': False}}

    def create(self, validated_data):
        profile_data = validated_data.pop('profile', {})
        role = profile_data.get('role', 'MECHANIC')
        password = validated_data.pop('password', None)
        
        user = User.objects.create(**validated_data)
        if password:
            user.set_password(password)
            user.save()
            
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = role
        profile.save()
        
        if role == 'ADMIN':
            user.is_staff = True
            user.is_superuser = True
        else:
            user.is_staff = False
            user.is_superuser = False
        user.save()
        return user

    def update(self, instance, validated_data):
        profile_data = validated_data.pop('profile', {})
        role = profile_data.get('role')
        password = validated_data.pop('password', None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
            
        if password:
            instance.set_password(password)
        instance.save()
        
        if role:
            profile, _ = UserProfile.objects.get_or_create(user=instance)
            profile.role = role
            profile.save()
            if role == 'ADMIN':
                instance.is_staff = True
                instance.is_superuser = True
            else:
                instance.is_staff = False
                instance.is_superuser = False
            instance.save()
        return instance

class UserViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = User.objects.all().order_by('-id')
    serializer_class = UserSerializer

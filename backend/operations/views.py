from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
import requests
from .models import Client, Vehicle, WorkOrder, WorkOrderItem, VisualInspection
from .serializers import ClientSerializer, VehicleSerializer, WorkOrderSerializer, WorkOrderItemSerializer, VisualInspectionSerializer

class ClientViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Client.objects.all()
    serializer_class = ClientSerializer

class VehicleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer

class WorkOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = WorkOrder.objects.all()
    serializer_class = WorkOrderSerializer

    @action(detail=True, methods=['post'])
    def notify_client(self, request, pk=None):
        work_order = self.get_object()
        client = work_order.vehicle.client
        
        if not client or not client.phone:
            return Response({'error': 'El vehículo no tiene un cliente asignado con teléfono válido.'}, status=status.HTTP_400_BAD_REQUEST)
        
        message = request.data.get('message', f"Hola {client.first_name}, tu vehículo {work_order.vehicle.license_plate} tiene una actualización. Estado: {work_order.get_status_display()}")
        
        try:
            # Reemplazar con la URL real del microservicio en producción si es diferente
            whatsapp_service_url = "http://localhost:3000/send" 
            response = requests.post(whatsapp_service_url, json={
                "phone": client.phone,
                "message": message
            })
            
            if response.status_code == 200:
                return Response({'success': True, 'message': 'Notificación enviada vía WhatsApp.'})
            else:
                return Response({'error': 'Fallo al enviar notificación al microservicio.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            return Response({'error': f'Error de conexión con microservicio: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class WorkOrderItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = WorkOrderItem.objects.all()
    serializer_class = WorkOrderItemSerializer

class VisualInspectionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = VisualInspection.objects.all()
    serializer_class = VisualInspectionSerializer

class CustomAuthToken(APIView):
    def post(self, request, *args, **kwargs):
        username = request.data.get('username')
        password = request.data.get('password')
        
        user = authenticate(username=username, password=password)
        
        if user is not None:
            token, created = Token.objects.get_or_create(user=user)
            role = 'superadmin' if user.is_superuser else 'tenant'
            return Response({
                'token': token.key,
                'role': role,
                'user_id': user.pk,
                'username': user.username
            })
        else:
            return Response({'error': 'Credenciales inválidas'}, status=status.HTTP_401_UNAUTHORIZED)

class ClientAuthToken(APIView):
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
            orders_data = []
            for order in active_orders:
                orders_data.append({
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
                'active_orders': orders_data
            })
            
        return Response(data)

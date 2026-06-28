from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from .models import Vehicle, WorkOrder, VisualInspection
from .serializers import VehicleSerializer, WorkOrderSerializer, VisualInspectionSerializer

class VehicleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer

class WorkOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = WorkOrder.objects.all()
    serializer_class = WorkOrderSerializer

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
    """
    Authenticate clients using their phone number. 
    In production, this would send a WhatsApp magic link instead of immediately logging them in.
    """
    def post(self, request, *args, **kwargs):
        phone = request.data.get('phone')
        
        # Check if any vehicle has this owner's phone number
        vehicles = Vehicle.objects.filter(owner_phone=phone)
        
        if vehicles.exists():
            # Simply return success for now to let frontend proceed
            # In a real app, this would generate a one-time token and send it via Whatsapp
            return Response({
                'success': True,
                'message': 'Magic link sent',
                'phone': phone
            })
        else:
            return Response({'error': 'Número no encontrado en nuestros registros'}, status=status.HTTP_404_NOT_FOUND)

class ClientDataView(APIView):
    """
    Fetch a client's vehicles and active work orders based on their phone number.
    """
    def get(self, request, *args, **kwargs):
        phone = request.query_params.get('phone')
        if not phone:
            return Response({"error": "Phone number required"}, status=status.HTTP_400_BAD_REQUEST)
            
        vehicles = Vehicle.objects.filter(owner_phone=phone)
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
                    # We can assume a default service description since we don't have a services model yet
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

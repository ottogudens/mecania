from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from .models import Vehicle, WorkOrder, VisualInspection
from .serializers import VehicleSerializer, WorkOrderSerializer, VisualInspectionSerializer

class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer

class WorkOrderViewSet(viewsets.ModelViewSet):
    queryset = WorkOrder.objects.all()
    serializer_class = WorkOrderSerializer

class VisualInspectionViewSet(viewsets.ModelViewSet):
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

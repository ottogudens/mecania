from rest_framework import viewsets
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

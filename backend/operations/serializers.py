from rest_framework import serializers
from .models import Vehicle, WorkOrder, VisualInspection

class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = '__all__'

class VisualInspectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = VisualInspection
        fields = '__all__'

class WorkOrderSerializer(serializers.ModelSerializer):
    vehicle = VehicleSerializer(read_only=True)
    vehicle_id = serializers.PrimaryKeyRelatedField(
        queryset=Vehicle.objects.all(), source='vehicle', write_only=True
    )
    inspections = VisualInspectionSerializer(many=True, read_only=True)

    class Meta:
        model = WorkOrder
        fields = '__all__'

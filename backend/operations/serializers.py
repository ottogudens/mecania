from rest_framework import serializers
from .models import Client, Vehicle, WorkOrder, WorkOrderItem, VisualInspection, WorkshopSettings
from django.contrib.auth.models import User

class WorkshopSettingsSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = WorkshopSettings
        fields = ['name', 'logo', 'logo_url', 'phone', 'address', 'email', 'website', 'google_maps_link']
    
    def get_logo_url(self, obj):
        return obj.logo

class ClientSerializer(serializers.ModelSerializer):
    vehicle_count = serializers.SerializerMethodField()
    class Meta:
        model = Client
        fields = '__all__'
        
    def get_vehicle_count(self, obj):
        return obj.vehicles.count()

class VehicleSerializer(serializers.ModelSerializer):
    client = ClientSerializer(read_only=True)
    client_id = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.all(), source='client', write_only=True, required=False
    )
    class Meta:
        model = Vehicle
        fields = '__all__'

class VisualInspectionSerializer(serializers.ModelSerializer):
    vehicle_plate = serializers.CharField(source='vehicle.license_plate', read_only=True)
    vehicle_make = serializers.CharField(source='vehicle.make', read_only=True)
    vehicle_model = serializers.CharField(source='vehicle.model', read_only=True)
    mechanic_username = serializers.CharField(source='mechanic.username', read_only=True)
    vehicle_id = serializers.PrimaryKeyRelatedField(queryset=Vehicle.objects.all(), source='vehicle', required=False, allow_null=True)

    class Meta:
        model = VisualInspection
        fields = [
            'id', 'vehicle_id', 'vehicle_plate', 'vehicle_make', 'vehicle_model', 
            'mechanic', 'mechanic_username', 'status', 'notes', 'items_json', 
            'created_at', 'updated_at', 'work_order', 'category', 'evidence_file', 'observations'
        ]

class WorkOrderItemSerializer(serializers.ModelSerializer):
    total_price = serializers.ReadOnlyField()
    product_name = serializers.CharField(source='product.name', read_only=True, default=None)
    service_name = serializers.CharField(source='service.name', read_only=True, default=None)
    class Meta:
        model = WorkOrderItem
        fields = '__all__'

class WorkOrderSerializer(serializers.ModelSerializer):
    vehicle = VehicleSerializer(read_only=True)
    vehicle_id = serializers.PrimaryKeyRelatedField(
        queryset=Vehicle.objects.all(), source='vehicle', write_only=True
    )
    inspections = VisualInspectionSerializer(many=True, read_only=True)
    items = WorkOrderItemSerializer(many=True, read_only=True)
    
    # Exponer nombre del mecánico si está asignado
    mechanic_name = serializers.CharField(source='mechanic.username', read_only=True)

    class Meta:
        model = WorkOrder
        fields = '__all__'

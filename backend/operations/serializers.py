from rest_framework import serializers
from .models import Client, Vehicle, WorkOrder, WorkOrderItem, VisualInspection, WorkshopSettings
from django.contrib.auth.models import User

class WorkshopSettingsSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = WorkshopSettings
        fields = ['name', 'logo', 'logo_url', 'phone', 'address', 'email', 'website']
    
    def get_logo_url(self, obj):
        if obj.logo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.logo.url)
            return obj.logo.url
        return None

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
    class Meta:
        model = VisualInspection
        fields = '__all__'

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

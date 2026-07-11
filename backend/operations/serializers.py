from rest_framework import serializers
from .models import (
    Client, Vehicle, WorkOrder, WorkOrderItem, VisualInspection,
    WorkshopSettings, VehiclePart, MaintenanceRecord, ScheduledMaintenance,
    WhatsAppFlow, WhatsAppMessage, WorkOrderAttachment
)
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta

class WorkshopSettingsSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = WorkshopSettings
        fields = ['name', 'logo', 'logo_url', 'phone', 'admin_whatsapp', 'address', 'email', 'website', 'google_maps_link', 'assistant_prompt']
    
    def get_logo_url(self, obj):
        return obj.logo

class ClientSerializer(serializers.ModelSerializer):
    vehicle_count = serializers.SerializerMethodField()
    has_pin = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = '__all__'
        extra_kwargs = {'pin_hash': {'write_only': True, 'required': False}}

    def get_vehicle_count(self, obj):
        return obj.vehicles.count()

    def get_has_pin(self, obj):
        return bool(obj.pin_hash)

class VehicleSerializer(serializers.ModelSerializer):
    client = ClientSerializer(read_only=True)
    client_id = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.all(), source='client', write_only=True, required=False, allow_null=True
    )
    parts_count = serializers.SerializerMethodField()
    maintenance_count = serializers.SerializerMethodField()
    pending_maintenance_count = serializers.SerializerMethodField()

    class Meta:
        model = Vehicle
        fields = '__all__'

    def get_parts_count(self, obj):
        return obj.parts.count()

    def get_maintenance_count(self, obj):
        return obj.maintenance_records.count()

    def get_pending_maintenance_count(self, obj):
        return obj.scheduled_maintenance.filter(status__in=['PENDING', 'NOTIFIED', 'OVERDUE']).count()

class VisualInspectionListSerializer(serializers.ModelSerializer):
    vehicle_plate = serializers.CharField(source='vehicle.license_plate', read_only=True)
    vehicle_make = serializers.CharField(source='vehicle.make', read_only=True)
    vehicle_model = serializers.CharField(source='vehicle.model', read_only=True)
    mechanic_username = serializers.CharField(source='mechanic.username', read_only=True)
    vehicle_id = serializers.PrimaryKeyRelatedField(queryset=Vehicle.objects.all(), source='vehicle', required=False, allow_null=True)

    vehicle_client_id = serializers.IntegerField(source='vehicle.client.id', read_only=True, default=None)

    class Meta:
        model = VisualInspection
        fields = [
            'id', 'vehicle_id', 'vehicle_plate', 'vehicle_make', 'vehicle_model', 
            'mechanic', 'mechanic_username', 'status', 'notes', 
            'created_at', 'updated_at', 'work_order', 'category', 'evidence_file', 'observations',
            'vehicle_client_id'
        ]

class VisualInspectionSerializer(serializers.ModelSerializer):
    vehicle_plate = serializers.CharField(source='vehicle.license_plate', read_only=True)
    vehicle_make = serializers.CharField(source='vehicle.make', read_only=True)
    vehicle_model = serializers.CharField(source='vehicle.model', read_only=True)
    mechanic_username = serializers.CharField(source='mechanic.username', read_only=True)
    vehicle_id = serializers.PrimaryKeyRelatedField(queryset=Vehicle.objects.all(), source='vehicle', required=False, allow_null=True)

    vehicle_client_id = serializers.IntegerField(source='vehicle.client.id', read_only=True, default=None)

    class Meta:
        model = VisualInspection
        fields = [
            'id', 'vehicle_id', 'vehicle_plate', 'vehicle_make', 'vehicle_model', 
            'mechanic', 'mechanic_username', 'status', 'notes', 'items_json', 
            'created_at', 'updated_at', 'work_order', 'category', 'evidence_file', 'observations',
            'vehicle_client_id'
        ]

class WorkOrderItemSerializer(serializers.ModelSerializer):
    total_price = serializers.ReadOnlyField()
    product_name = serializers.CharField(source='product.name', read_only=True, default=None)
    service_name = serializers.CharField(source='service.name', read_only=True, default=None)
    class Meta:
        model = WorkOrderItem
        fields = '__all__'

class WorkOrderAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkOrderAttachment
        fields = ['id', 'work_order', 'file', 'file_name', 'uploaded_at']
        read_only_fields = ['file_name', 'uploaded_at']

class WorkOrderSerializer(serializers.ModelSerializer):
    vehicle = VehicleSerializer(read_only=True)
    vehicle_id = serializers.PrimaryKeyRelatedField(
        queryset=Vehicle.objects.all(), source='vehicle', write_only=True
    )
    inspections = VisualInspectionSerializer(many=True, read_only=True)
    items = WorkOrderItemSerializer(many=True, read_only=True)
    attachments = WorkOrderAttachmentSerializer(many=True, read_only=True)
    
    # Exponer nombre del mecánico si está asignado
    mechanic_name = serializers.CharField(source='mechanic.username', read_only=True)

    class Meta:
        model = WorkOrder
        fields = '__all__'


# ── Nuevos Serializers para Ficha del Vehículo ──

class VehiclePartSerializer(serializers.ModelSerializer):
    vehicle_plate = serializers.CharField(source='vehicle.license_plate', read_only=True)
    work_order_display = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = VehiclePart
        fields = [
            'id', 'vehicle', 'vehicle_plate', 'work_order', 'work_order_display',
            'name', 'oem_number', 'brand', 'category', 'category_display',
            'installed_at', 'installed_mileage', 'notes', 'created_at'
        ]

    def get_work_order_display(self, obj):
        if obj.work_order:
            return f"OT-{obj.work_order.id}"
        return None


class MaintenanceRecordSerializer(serializers.ModelSerializer):
    vehicle_plate = serializers.CharField(source='vehicle.license_plate', read_only=True)
    maintenance_type_display = serializers.CharField(source='get_maintenance_type_display', read_only=True)
    work_order_display = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceRecord
        fields = [
            'id', 'vehicle', 'vehicle_plate', 'work_order', 'work_order_display',
            'maintenance_type', 'maintenance_type_display', 'description',
            'mileage', 'date_performed', 'product_details', 'cost',
            'performed_by', 'created_at'
        ]

    def get_work_order_display(self, obj):
        if obj.work_order:
            return f"OT-{obj.work_order.id}"
        return None


class ScheduledMaintenanceSerializer(serializers.ModelSerializer):
    vehicle_plate = serializers.CharField(source='vehicle.license_plate', read_only=True)
    vehicle_make = serializers.CharField(source='vehicle.make', read_only=True)
    vehicle_model = serializers.CharField(source='vehicle.model', read_only=True)
    client_name = serializers.SerializerMethodField()
    client_phone = serializers.SerializerMethodField()
    maintenance_type_display = serializers.CharField(source='get_maintenance_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    is_due_soon = serializers.SerializerMethodField()
    days_remaining = serializers.SerializerMethodField()

    class Meta:
        model = ScheduledMaintenance
        fields = [
            'id', 'vehicle', 'vehicle_plate', 'vehicle_make', 'vehicle_model',
            'client_name', 'client_phone',
            'maintenance_type', 'maintenance_type_display', 'description',
            'due_mileage', 'due_date', 'status', 'status_display',
            'notified_at', 'notes', 'created_at',
            'is_due_soon', 'days_remaining'
        ]

    def get_client_name(self, obj):
        client = obj.vehicle.client
        if client:
            return f"{client.first_name} {client.last_name}"
        return None

    def get_client_phone(self, obj):
        client = obj.vehicle.client
        if client:
            return client.phone
        return None

    def get_is_due_soon(self, obj):
        """Returns True if due within 30 days or status is OVERDUE."""
        if obj.status == 'OVERDUE':
            return True
        if obj.due_date:
            return obj.due_date <= (timezone.now().date() + timedelta(days=30))
        return False

    def get_days_remaining(self, obj):
        """Returns number of days until due_date (negative = overdue)."""
        if obj.due_date:
            delta = obj.due_date - timezone.now().date()
            return delta.days
        return None


class WhatsAppFlowSerializer(serializers.ModelSerializer):
    trigger_type_display = serializers.CharField(source='get_trigger_type_display', read_only=True)
    action_type_display = serializers.CharField(source='get_action_type_display', read_only=True)

    class Meta:
        model = WhatsAppFlow
        fields = '__all__'


class WhatsAppMessageSerializer(serializers.ModelSerializer):
    client_name = serializers.SerializerMethodField(read_only=True)
    sender_display = serializers.CharField(source='get_sender_display', read_only=True)

    class Meta:
        model = WhatsAppMessage
        fields = ['id', 'phone', 'client', 'client_name', 'sender', 'sender_display', 'text', 'timestamp']

    def get_client_name(self, obj):
        if obj.client:
            return f"{obj.client.first_name} {obj.client.last_name}"
        return None



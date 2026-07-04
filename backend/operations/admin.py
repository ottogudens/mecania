from django.contrib import admin
from .models import (
    Client, Vehicle, WorkOrder, WorkOrderItem, VisualInspection,
    WorkshopSettings, VehiclePart, MaintenanceRecord, ScheduledMaintenance,
    WhatsAppFlow, WhatsAppSession
)


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'last_name', 'phone', 'email')
    search_fields = ('first_name', 'last_name', 'phone')


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ('license_plate', 'make', 'model', 'year', 'client')
    search_fields = ('license_plate', 'make', 'model', 'vin')
    list_filter = ('make', 'fuel_type', 'transmission_type')


@admin.register(WorkOrder)
class WorkOrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'vehicle', 'status', 'mechanic', 'created_at')
    list_filter = ('status',)
    search_fields = ('vehicle__license_plate',)


@admin.register(WorkOrderItem)
class WorkOrderItemAdmin(admin.ModelAdmin):
    list_display = ('work_order', 'description', 'quantity', 'unit_price')


@admin.register(VisualInspection)
class VisualInspectionAdmin(admin.ModelAdmin):
    list_display = ('vehicle', 'status', 'mechanic', 'created_at')
    list_filter = ('status',)


admin.site.register(WorkshopSettings)


@admin.register(VehiclePart)
class VehiclePartAdmin(admin.ModelAdmin):
    list_display = ('name', 'oem_number', 'brand', 'category', 'vehicle', 'installed_at')
    list_filter = ('category',)
    search_fields = ('name', 'oem_number', 'brand', 'vehicle__license_plate')


@admin.register(MaintenanceRecord)
class MaintenanceRecordAdmin(admin.ModelAdmin):
    list_display = ('maintenance_type', 'vehicle', 'date_performed', 'mileage', 'cost')
    list_filter = ('maintenance_type',)
    search_fields = ('vehicle__license_plate', 'description')


@admin.register(ScheduledMaintenance)
class ScheduledMaintenanceAdmin(admin.ModelAdmin):
    list_display = ('maintenance_type', 'vehicle', 'due_date', 'due_mileage', 'status')
    list_filter = ('status', 'maintenance_type')
    search_fields = ('vehicle__license_plate', 'description')


@admin.register(WhatsAppFlow)
class WhatsAppFlowAdmin(admin.ModelAdmin):
    list_display = ('name', 'trigger_type', 'action_type', 'is_active', 'created_at')
    list_filter = ('trigger_type', 'action_type', 'is_active')
    search_fields = ('name', 'keywords', 'response_text')


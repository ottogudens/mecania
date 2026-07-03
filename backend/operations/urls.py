from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClientViewSet, VehicleViewSet, WorkOrderViewSet, 
    WorkOrderItemViewSet, VisualInspectionViewSet, 
    CustomAuthToken, ClientAuthToken, ClientDataView, ClientVehicleDetailView,
    AIDiagnosticsView, AITranscribeView, WorkshopSettingsView,
    DashboardStatsView, UserViewSet,
    VehiclePartViewSet, MaintenanceRecordViewSet,
    ScheduledMaintenanceViewSet, MaintenanceAlertsView, WhatsAppSessionView
)

router = DefaultRouter()
router.register(r'clients', ClientViewSet)
router.register(r'vehicles', VehicleViewSet)
router.register(r'work-orders', WorkOrderViewSet)
router.register(r'work-order-items', WorkOrderItemViewSet)
router.register(r'inspections', VisualInspectionViewSet)
router.register(r'users', UserViewSet)
router.register(r'vehicle-parts', VehiclePartViewSet, basename='vehiclepart')
router.register(r'maintenance-records', MaintenanceRecordViewSet, basename='maintenancerecord')
router.register(r'scheduled-maintenance', ScheduledMaintenanceViewSet, basename='scheduledmaintenance')

urlpatterns = [
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard_stats'),
    path('maintenance-alerts/', MaintenanceAlertsView.as_view(), name='maintenance_alerts'),
    path('settings/', WorkshopSettingsView.as_view(), name='workshop_settings'),
    path('login/', CustomAuthToken.as_view(), name='api_login'),
    # Client portal endpoints (public, token-based auth)
    path('client/auth/', ClientAuthToken.as_view(), name='client_auth'),
    path('client/login/', ClientAuthToken.as_view(), name='client_login'),  # backward compat
    path('client/data/', ClientDataView.as_view(), name='client_data'),
    path('client/vehicles/<int:pk>/', ClientVehicleDetailView.as_view(), name='client_vehicle_detail'),
    # AI endpoints
    path('ai-diagnostics/', AIDiagnosticsView.as_view(), name='ai_diagnostics'),
    path('ai-transcribe/', AITranscribeView.as_view(), name='ai_transcribe'),
    # WhatsApp session persistence
    path('whatsapp-session/', WhatsAppSessionView.as_view(), name='whatsapp_session'),
    path('', include(router.urls)),
]

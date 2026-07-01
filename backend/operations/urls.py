from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClientViewSet, VehicleViewSet, WorkOrderViewSet, 
    WorkOrderItemViewSet, VisualInspectionViewSet, 
    CustomAuthToken, ClientAuthToken, ClientDataView,
    AIDiagnosticsView, AITranscribeView, WorkshopSettingsView,
    DashboardStatsView, UserViewSet,
    VehiclePartViewSet, MaintenanceRecordViewSet,
    ScheduledMaintenanceViewSet, MaintenanceAlertsView
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
    path('client/login/', ClientAuthToken.as_view(), name='client_login'),
    path('client/data/', ClientDataView.as_view(), name='client_data'),
    path('ai-diagnostics/', AIDiagnosticsView.as_view(), name='ai_diagnostics'),
    path('ai-transcribe/', AITranscribeView.as_view(), name='ai_transcribe'),
    path('', include(router.urls)),
]


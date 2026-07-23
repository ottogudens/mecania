from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClientViewSet, VehicleViewSet, WorkOrderViewSet, 
    WorkOrderItemViewSet, WorkOrderAttachmentViewSet, VisualInspectionViewSet, 
    CustomAuthToken, ClientAuthToken, ClientDataView, ClientVehicleDetailView, ClientChangePinView,
    AIDiagnosticsView, AITranscribeView, WorkshopSettingsView,
    DashboardStatsView, UserViewSet,
    VehiclePartViewSet, MaintenanceRecordViewSet,
    ScheduledMaintenanceViewSet, MaintenanceAlertsView, WhatsAppSessionView,
    WhatsAppFlowViewSet, WhatsAppChatListView, WhatsAppMessageListView, WhatsAppManualSendView,
    WhatsAppLogoutView, WhatsAppMessageSyncView, WhatsAppStatusView, WhatsAppToggleSilenceView,
    WhatsAppLogoutView, WhatsAppMessageSyncView, WhatsAppStatusView, WhatsAppToggleSilenceView,
    WhatsAppLogoutView, WhatsAppMessageSyncView, WhatsAppStatusView, WhatsAppToggleSilenceView,
    WhatsAppLogoutView, WhatsAppMessageSyncView, WhatsAppStatusView, WhatsAppToggleSilenceView,
    DatabaseBackupView, DatabaseRestoreView, WhatsAppClearChatsView, WhatsAppRequestPairingCodeView,
    AIVehicleSummaryView, ClientWorkOrderPDFView, ClientInspectionPDFView,
    PortalOfferViewSet, PortalBlogPostViewSet, TechnicalKnowledgeDocumentViewSet
)

router = DefaultRouter()
router.register(r'clients', ClientViewSet)
router.register(r'vehicles', VehicleViewSet)
router.register(r'work-orders', WorkOrderViewSet)
router.register(r'work-order-items', WorkOrderItemViewSet)
router.register(r'work-order-attachments', WorkOrderAttachmentViewSet)
router.register(r'inspections', VisualInspectionViewSet)
router.register(r'users', UserViewSet)
router.register(r'vehicle-parts', VehiclePartViewSet, basename='vehiclepart')
router.register(r'maintenance-records', MaintenanceRecordViewSet, basename='maintenancerecord')
router.register(r'scheduled-maintenance', ScheduledMaintenanceViewSet, basename='scheduledmaintenance')
router.register(r'whatsapp-flows', WhatsAppFlowViewSet, basename='whatsappflow')
router.register(r'portal-offers', PortalOfferViewSet, basename='portaloffer')
router.register(r'portal-blogs', PortalBlogPostViewSet, basename='portalblog')
router.register(r'technical-knowledge', TechnicalKnowledgeDocumentViewSet, basename='technicalknowledge')

urlpatterns = [
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard_stats'),
    path('maintenance-alerts/', MaintenanceAlertsView.as_view(), name='maintenance_alerts'),
    path('settings/', WorkshopSettingsView.as_view(), name='workshop_settings'),
    path('login/', CustomAuthToken.as_view(), name='api_login'),
    # Client portal endpoints (public, token-based auth)
    path('client/auth/', ClientAuthToken.as_view(), name='client_auth'),
    path('client/login/', ClientAuthToken.as_view(), name='client_login'),  # backward compat
    path('client/change-pin/', ClientChangePinView.as_view(), name='client_change_pin'),
    path('client/data/', ClientDataView.as_view(), name='client_data'),
    path('client/vehicles/<int:pk>/', ClientVehicleDetailView.as_view(), name='client_vehicle_detail'),
    path('client/work-orders/<int:pk>/pdf/', ClientWorkOrderPDFView.as_view(), name='client_work_order_pdf'),
    path('client/inspections/<int:pk>/pdf/', ClientInspectionPDFView.as_view(), name='client_inspection_pdf'),
    # AI endpoints
    path('ai-diagnostics/', AIDiagnosticsView.as_view(), name='ai_diagnostics'),
    path('ai-transcribe/', AITranscribeView.as_view(), name='ai_transcribe'),
    path('vehicles/ai-summary/', AIVehicleSummaryView.as_view(), name='ai_vehicle_summary'),
    # WhatsApp session persistence
    path('whatsapp-session/', WhatsAppSessionView.as_view(), name='whatsapp_session'),
    # WhatsApp Chat history and manual messaging
    path('whatsapp-messages/', WhatsAppMessageListView.as_view(), name='whatsapp_messages'),
    path('whatsapp-messages/chats/', WhatsAppChatListView.as_view(), name='whatsapp_chats'),
    path('whatsapp-messages/sync/', WhatsAppMessageSyncView.as_view(), name='whatsapp_messages_sync'),
    path('whatsapp-messages/send-manual/', WhatsAppManualSendView.as_view(), name='whatsapp_send_manual'),
    path('whatsapp-messages/toggle-silence/', WhatsAppToggleSilenceView.as_view(), name='whatsapp_toggle_silence'),
    path('whatsapp-messages/clear/', WhatsAppClearChatsView.as_view(), name='whatsapp_clear_chats'),
    path('whatsapp/status/', WhatsAppStatusView.as_view(), name='whatsapp_status'),
    path('whatsapp/request-pairing-code/', WhatsAppRequestPairingCodeView.as_view(), name='whatsapp_request_pairing_code'),
    path('whatsapp/logout/', WhatsAppLogoutView.as_view(), name='whatsapp_logout'),
    path('system/backup/', DatabaseBackupView.as_view(), name='database_backup'),
    path('system/restore/', DatabaseRestoreView.as_view(), name='database_restore'),
    path('', include(router.urls)),
]

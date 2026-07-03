from django.urls import path
from .views import TranscribeAudioView, GenerateDiagnosisView, WhatsAppAgentView

urlpatterns = [
    path('transcribe/', TranscribeAudioView.as_view(), name='ai-transcribe'),
    path('diagnose/', GenerateDiagnosisView.as_view(), name='ai-diagnose'),
    path('whatsapp-agent/', WhatsAppAgentView.as_view(), name='ai-whatsapp-agent'),
]

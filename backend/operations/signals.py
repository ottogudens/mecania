import requests
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from .models import WorkOrder
import os

WHATSAPP_SERVICE_URL = os.environ.get('WHATSAPP_SERVICE_URL', 'http://localhost:3000/api/send-message')

@receiver(post_save, sender=WorkOrder)
def notify_client_on_status_change(sender, instance, created, **kwargs):
    # Only notify if we have the owner's phone number
    phone = instance.vehicle.owner_phone
    if not phone or phone == '0000000000':
        return

    # Check if status has changed. In a real robust system, we'd use a field tracker, 
    # but for this prototype, we'll notify on specific important statuses.
    if instance.status == 'COMPLETED':
        message = f"¡Hola {instance.vehicle.owner_name}! Tu vehículo {instance.vehicle.make} {instance.vehicle.model} (Placa: {instance.vehicle.license_plate}) ya está listo para ser retirado. ¡Gracias por confiar en AutoMaster!"
    elif instance.status == 'IN_PROGRESS':
        message = f"¡Hola {instance.vehicle.owner_name}! Hemos comenzado a trabajar en tu vehículo {instance.vehicle.make} {instance.vehicle.model}. Te mantendremos informado."
    else:
        return

    # Send the message to the Node.js WhatsApp microservice
    try:
        payload = {
            "number": phone,
            "message": message
        }
        # We don't block the Django thread for too long
        requests.post(WHATSAPP_SERVICE_URL, json=payload, timeout=5)
    except Exception as e:
        print(f"Error sending WhatsApp notification: {str(e)}")

import requests
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from .models import WorkOrder
import os
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

WHATSAPP_SERVICE_URL = os.environ.get('WHATSAPP_SERVICE_URL', 'http://localhost:3000/api/send-message')

@receiver(post_save, sender=WorkOrder)
def notify_client_on_status_change(sender, instance, created, **kwargs):
    # Send WebSocket update for any change
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            'work_orders',
            {
                'type': 'work_order_updated',
                'work_order_id': instance.id,
                'message': f"Orden {instance.id} {'creada' if created else 'actualizada'} a {instance.get_status_display()}"
            }
        )
    except Exception as e:
        print(f"Error sending WebSocket update: {str(e)}")

    # Only notify WhatsApp if we have the owner's phone number and specific status
    # The client might be None, so we need to check safely
    client = instance.vehicle.client if hasattr(instance.vehicle, 'client') else None
    if not client:
        return
        
    phone = client.phone
    if not phone or phone == '0000000000':
        return

    # Check if status has changed.
    if instance.status == 'COMPLETED':
        message = f"¡Hola {client.first_name}! Tu vehículo {instance.vehicle.make} {instance.vehicle.model} (Placa: {instance.vehicle.license_plate}) ya está listo para ser retirado. ¡Gracias por confiar en AutoMaster!"
    elif instance.status == 'IN_PROGRESS':
        message = f"¡Hola {client.first_name}! Hemos comenzado a trabajar en tu vehículo {instance.vehicle.make} {instance.vehicle.model}. Te mantendremos informado."
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

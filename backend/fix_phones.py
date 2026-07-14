import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'automaster.settings')
django.setup()
from operations.models import WhatsAppMessage

msgs = WhatsAppMessage.objects.all()
count = 0
for m in msgs:
    if ':' in m.phone:
        m.phone = m.phone.split(':')[0]
        m.save()
        count += 1
print(f"Updated {count} messages.")

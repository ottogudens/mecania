from django.db import migrations

def cleanup_lid_messages(apps, schema_editor):
    WhatsAppMessage = apps.get_model('operations', 'WhatsAppMessage')
    count = 0
    for msg in WhatsAppMessage.objects.all():
        clean_num = ''.join(filter(str.isdigit, msg.phone))
        is_lid = '@lid' in msg.phone or clean_num.startswith('2377') or (len(clean_num) >= 14 and not clean_num.startswith('56'))
        if is_lid:
            msg.delete()
            count += 1
    print(f"Eliminados {count} mensajes duplicados con formato LID/desconocido.")

class Migration(migrations.Migration):

    dependencies = [
        ('operations', '0024_userprofile_phone'),
    ]

    operations = [
        migrations.RunPython(cleanup_lid_messages),
    ]

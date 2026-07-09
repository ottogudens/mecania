from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Corrige el constraint UNIQUE en el campo email del modelo Client.
    
    El problema: `unique=True` en un campo `null=True` solo permite UN valor NULL
    en la base de datos, por lo que el segundo cliente sin email fallaba al guardarse.
    
    La solución: reemplazar el unique index simple por un UniqueConstraint condicional
    que solo aplica cuando email NO es NULL.
    """

    dependencies = [
        ('operations', '0022_workorderattachment'),
    ]

    operations = [
        # 1. Quitar el índice UNIQUE simple del campo email
        migrations.AlterField(
            model_name='client',
            name='email',
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        # 2. Agregar el UniqueConstraint condicional (solo cuando email no es NULL)
        migrations.AddConstraint(
            model_name='client',
            constraint=models.UniqueConstraint(
                condition=models.Q(email__isnull=False),
                fields=['email'],
                name='unique_client_email_when_not_null',
            ),
        ),
    ]

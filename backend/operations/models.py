import re
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator
from django.core.exceptions import ValidationError

def validate_license_plate(value):
    val = value.upper().replace(" ", "").replace("-", "")
    if not re.match(r'^[A-Z]{2}\d{4}$|^[A-Z]{4}\d{2}$', val):
        raise ValidationError("La patente debe tener formato chileno válido (ej: AB1234 o ABCD12).")

class WorkshopSettings(models.Model):
    name = models.CharField(max_length=100, default="MecanIA")
    logo = models.TextField(blank=True, null=True, help_text="Logo del taller en formato Base64")
    phone = models.CharField(max_length=20, blank=True)
    admin_whatsapp = models.CharField(
        max_length=20, 
        blank=True, 
        help_text="Número de WhatsApp del Administrador para notificaciones de cierre de caja (ej: +56912345678)"
    )
    address = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    google_maps_link = models.URLField(blank=True, null=True, help_text="Enlace de ubicación en Google Maps")
    assistant_prompt = models.TextField(
        blank=True, 
        default='', 
        help_text="Prompt del sistema para el comportamiento general del asistente de IA."
    )

    def save(self, *args, **kwargs):
        self.pk = 1 # Singleton
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, created = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return self.name


class Client(models.Model):
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    # unique=True removido del campo para permitir múltiples NULL.
    # La unicidad se garantiza con UniqueConstraint condicional en Meta.
    email = models.EmailField(null=True, blank=True)
    phone = models.CharField(
        max_length=20,
        unique=True,
        validators=[RegexValidator(r'^\+?[\d\s\-]{7,20}$', 'Ingrese un número de teléfono válido.')]
    )
    address = models.CharField(max_length=255, null=True, blank=True)
    pin_hash = models.CharField(
        max_length=128, blank=True, default='',
        help_text="PIN de 4 dígitos hasheado para acceso al portal de clientes.",
    )
    portal_enabled = models.BooleanField(
        default=False,
        help_text="Indica si el cliente tiene acceso al portal.",
    )
    bot_silenced_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Silencia el asistente de IA para este cliente hasta esta fecha/hora."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['email'],
                condition=models.Q(email__isnull=False),
                name='unique_client_email_when_not_null',
            )
        ]

    def set_pin(self, raw_pin):
        """Hashea y almacena un PIN en texto plano."""
        from django.contrib.auth.hashers import make_password
        self.pin_hash = make_password(raw_pin)

    def check_pin(self, raw_pin):
        """Verifica un PIN en texto plano contra el hash almacenado."""
        from django.contrib.auth.hashers import check_password
        if not self.pin_hash:
            return False
        return check_password(raw_pin, self.pin_hash)

    @staticmethod
    def generate_pin():
        """Genera un PIN aleatorio de 4 dígitos."""
        import random
        return f"{random.randint(0, 9999):04d}"

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('ADMIN', 'Administrador'),
        ('MECHANIC', 'Mecánico'),
    ]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='MECHANIC')
    phone = models.CharField(max_length=25, blank=True, default='')

    def __str__(self):
        return f"{self.user.username} - {self.get_role_display()}"

class Vehicle(models.Model):
    TRANSMISSION_CHOICES = [
        ('MANUAL', 'Manual'),
        ('AUTOMATIC', 'Automática'),
        ('CVT', 'CVT'),
        ('DCT', 'Doble Embrague'),
    ]

    FUEL_CHOICES = [
        ('GASOLINE', 'Gasolina'),
        ('DIESEL', 'Diesel'),
        ('HYBRID', 'Híbrido'),
        ('ELECTRIC', 'Eléctrico'),
        ('GNC_GLP', 'Gas (GNC/GLP)'),
    ]

    license_plate = models.CharField(max_length=20, unique=True, validators=[validate_license_plate])
    make = models.CharField(max_length=50)
    model = models.CharField(max_length=50)
    year = models.IntegerField()
    color = models.CharField(max_length=30, blank=True, null=True, help_text="Color del vehículo")
    transmission_type = models.CharField(max_length=20, choices=TRANSMISSION_CHOICES, default='MANUAL')
    fuel_type = models.CharField(max_length=20, choices=FUEL_CHOICES, default='GASOLINE')
    vin = models.CharField(max_length=50, blank=True, null=True, help_text="Número VIN (Chasis)")
    engine_number = models.CharField(max_length=50, blank=True, null=True, help_text="Número de Motor")
    engine_displacement = models.CharField(max_length=20, blank=True, null=True, help_text="Cilindrada (ej: 1.6, 2.0L)")
    mileage = models.IntegerField(blank=True, null=True, help_text="Kilometraje inicial")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='vehicles', null=True, blank=True)

    def clean(self):
        super().clean()
        self.license_plate = self.license_plate.upper().replace(" ", "").replace("-", "")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.license_plate} - {self.make} {self.model}"

class WorkOrder(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pendiente'),
        ('IN_PROGRESS', 'En Progreso'),
        ('COMPLETED', 'Completado'),
        ('DELIVERED', 'Entregado'),
        ('CANCELLED', 'Cancelado'),
    ]

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='work_orders')
    mechanic = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_work_orders')
    mileage = models.IntegerField(validators=[MinValueValidator(0)])
    fuel_level = models.IntegerField(
        help_text="Porcentaje de nivel de combustible (0-100)",
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    visit_reason = models.TextField(blank=True, null=True, help_text="Motivo de la visita")
    desired_service = models.TextField(blank=True, null=True, help_text="Servicio que desea realizar")
    symptoms = models.TextField(blank=True, null=True, help_text="Síntomas reportados")
    additional_findings = models.TextField(blank=True, null=True, help_text="Hallazgos o problemas adicionales encontrados por el mecánico")
    findings_approved = models.BooleanField(default=False, help_text="¿Los hallazgos adicionales fueron aprobados por el cliente?")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"OT-{self.id} / {self.vehicle.license_plate}"

class WorkOrderItem(models.Model):
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('inventory.Product', on_delete=models.RESTRICT, null=True, blank=True)
    service = models.ForeignKey('inventory.Service', on_delete=models.SET_NULL, null=True, blank=True)
    description = models.CharField(max_length=255, help_text="Descripción del repuesto o servicio")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    is_labor = models.BooleanField(default=False, help_text="¿Es mano de obra?")

    @property
    def total_price(self):
        return self.quantity * self.unit_price

    def save(self, *args, **kwargs):
        if self.work_order.status in ['COMPLETED', 'DELIVERED', 'PAID', 'CANCELLED']:
            raise ValidationError("No se pueden modificar ítems de una Orden de Trabajo cerrada o finalizada.")
        if not self.description:
            if self.product_id:
                self.description = self.product.name
            elif self.service_id:
                self.description = self.service.name
        super().save(*args, **kwargs)
        try:
            if hasattr(self.work_order, 'invoice') and self.work_order.invoice:
                self.work_order.invoice.recalculate_totals()
        except Exception:
            pass

    def delete(self, *args, **kwargs):
        if self.work_order.status in ['COMPLETED', 'DELIVERED', 'PAID', 'CANCELLED']:
            raise ValidationError("No se pueden eliminar ítems de una Orden de Trabajo cerrada o finalizada.")
        work_order = self.work_order
        super().delete(*args, **kwargs)
        try:
            if hasattr(work_order, 'invoice') and work_order.invoice:
                work_order.invoice.recalculate_totals()
        except Exception:
            pass

    def __str__(self):
        return f"{self.quantity}x {self.description} (OT-{self.work_order.id})"

class WorkOrderAttachment(models.Model):
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='work_orders/attachments/', help_text="Archivo adjunto")
    file_name = models.CharField(max_length=255, blank=True, help_text="Nombre original del archivo")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.file_name and self.file:
            import os
            self.file_name = os.path.basename(self.file.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Adjunto a OT-{self.work_order_id}: {self.file_name}"


class VisualInspection(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pendiente'),
        ('IN_PROGRESS', 'En Proceso'),
        ('COMPLETED', 'Completada'),
    ]

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='visual_inspections', null=True, blank=True)
    mechanic = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='inspections')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    notes = models.TextField(blank=True)
    items_json = models.JSONField(default=dict, blank=True, help_text="Resultados de la inspección por partes en formato JSON")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Legacy compatibility fields
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='inspections', null=True, blank=True)
    category = models.CharField(max_length=100, null=True, blank=True, help_text="Ej., Frenos, Neumáticos, Motor")
    evidence_file = models.FileField(upload_to='inspections/evidence/', null=True, blank=True)
    observations = models.TextField(blank=True)

    def __str__(self):
        plate = self.vehicle.license_plate if self.vehicle else "S/P"
        return f"Inspección {plate} - {self.get_status_display()}"


class VehiclePart(models.Model):
    """Registro de partes y repuestos instalados en un vehículo con número OEM."""
    CATEGORY_CHOICES = [
        ('FILTER', 'Filtro'),
        ('BELT', 'Correa'),
        ('BRAKE', 'Frenos'),
        ('SUSPENSION', 'Suspensión'),
        ('ENGINE', 'Motor'),
        ('ELECTRICAL', 'Eléctrico'),
        ('BODY', 'Carrocería'),
        ('COOLING', 'Refrigeración'),
        ('TRANSMISSION', 'Transmisión'),
        ('OTHER', 'Otro'),
    ]

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='parts')
    work_order = models.ForeignKey(WorkOrder, on_delete=models.SET_NULL, null=True, blank=True, related_name='installed_parts')
    name = models.CharField(max_length=200, help_text="Nombre de la parte (ej: Filtro de aceite)")
    oem_number = models.CharField(max_length=100, help_text="Número OEM del fabricante")
    brand = models.CharField(max_length=100, blank=True, help_text="Marca del repuesto (ej: Mann-Filter)")
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='OTHER')
    installed_at = models.DateField(help_text="Fecha de instalación")
    installed_mileage = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0)], help_text="Kilometraje al momento de instalar")
    notes = models.TextField(blank=True, help_text="Observaciones adicionales")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Parte de Vehículo"
        verbose_name_plural = "Partes de Vehículos"
        ordering = ['-installed_at']

    def __str__(self):
        return f"{self.name} (OEM: {self.oem_number}) - {self.vehicle.license_plate}"


MAINTENANCE_TYPE_CHOICES = [
    ('OIL_CHANGE', 'Cambio de Aceite'),
    ('FILTER_CHANGE', 'Cambio de Filtros'),
    ('BELT_CHANGE', 'Cambio de Correas'),
    ('BRAKE_SERVICE', 'Servicio de Frenos'),
    ('TIRE_ROTATION', 'Rotación de Neumáticos'),
    ('COOLANT_FLUSH', 'Cambio de Refrigerante'),
    ('TRANSMISSION_SERVICE', 'Servicio de Transmisión'),
    ('SPARK_PLUGS', 'Cambio de Bujías'),
    ('TIMING_BELT', 'Correa de Distribución'),
    ('GENERAL_SERVICE', 'Servicio General'),
    ('OTHER', 'Otro'),
]


class MaintenanceRecord(models.Model):
    """Historial de mantenciones realizadas a un vehículo."""
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='maintenance_records')
    work_order = models.ForeignKey(WorkOrder, on_delete=models.SET_NULL, null=True, blank=True, related_name='maintenance_records')
    maintenance_type = models.CharField(max_length=30, choices=MAINTENANCE_TYPE_CHOICES, default='GENERAL_SERVICE')
    description = models.TextField(help_text="Descripción de lo realizado")
    mileage = models.IntegerField(validators=[MinValueValidator(0)], help_text="Kilometraje al momento de la mantención")
    date_performed = models.DateField(help_text="Fecha de la mantención")
    product_details = models.TextField(blank=True, help_text="Detalles del producto usado (marca, especificación, viscosidad, etc.)")
    cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Costo de la mantención")
    performed_by = models.CharField(max_length=100, blank=True, help_text="Quién realizó el trabajo")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Registro de Mantención"
        verbose_name_plural = "Registros de Mantención"
        ordering = ['-date_performed']

    def __str__(self):
        return f"{self.get_maintenance_type_display()} - {self.vehicle.license_plate} ({self.date_performed})"


class ScheduledMaintenance(models.Model):
    """Próximas mantenciones programadas para un vehículo."""
    STATUS_CHOICES = [
        ('PENDING', 'Pendiente'),
        ('NOTIFIED', 'Notificado'),
        ('COMPLETED', 'Completado'),
        ('OVERDUE', 'Vencido'),
    ]

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='scheduled_maintenance')
    maintenance_type = models.CharField(max_length=30, choices=MAINTENANCE_TYPE_CHOICES, default='GENERAL_SERVICE')
    description = models.CharField(max_length=255, help_text="Descripción breve (ej: Próximo cambio de aceite)")
    due_mileage = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0)], help_text="Kilometraje al que se debe realizar")
    due_date = models.DateField(null=True, blank=True, help_text="Fecha límite para realizar")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    notified_at = models.DateTimeField(null=True, blank=True, help_text="Cuándo se notificó al cliente")
    notes = models.TextField(blank=True, help_text="Notas adicionales")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Mantención Programada"
        verbose_name_plural = "Mantenciones Programadas"
        ordering = ['due_date', 'due_mileage']

    def __str__(self):
        return f"{self.get_maintenance_type_display()} - {self.vehicle.license_plate} ({self.get_status_display()})"


class WhatsAppSession(models.Model):
    """Guarda los archivos de sesión de Baileys en la base de datos para persistirlos entre deploys efímeros."""
    key = models.CharField(max_length=255, unique=True, help_text="Nombre del archivo (ej: creds.json o pre-key-*)")
    data = models.TextField(help_text="Contenido serializado del archivo (Base64 o JSON texto)")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.key


class WhatsAppFlow(models.Model):
    TRIGGER_CHOICES = [
        ('welcome', 'Mensaje de Bienvenida (Welcome)'),
        ('keyword', 'Palabra Clave (Keyword)'),
        ('default', 'Respuesta por Defecto (Fallback)'),
    ]

    ACTION_CHOICES = [
        ('static', 'Mensaje de Texto Estático'),
        ('ai_assistant', 'Agente de IA (GPT)'),
        ('portal_link', 'Enviar Enlace de Acceso al Portal'),
        ('human_transfer', 'Derivar a Humano (Notificar / Pausar Asistente)'),
    ]

    name = models.CharField(max_length=100, verbose_name="Nombre del Flujo")
    trigger_type = models.CharField(max_length=20, choices=TRIGGER_CHOICES, default='keyword')
    keywords = models.CharField(
        max_length=255, 
        blank=True, 
        help_text="Lista de palabras separadas por comas. Ej: precio, cotizar, costo, valor", 
        verbose_name="Palabras Clave"
    )
    action_type = models.CharField(max_length=20, choices=ACTION_CHOICES, default='static')
    response_text = models.TextField(
        blank=True, 
        default='', 
        verbose_name="Mensaje de Respuesta / Instrucciones de IA", 
        help_text="El texto estático para responder, o las instrucciones de comportamiento personalizadas para el agente de IA."
    )
    buttons = models.TextField(
        blank=True, 
        default='', 
        verbose_name="Opciones / Botones (Uno por línea)", 
        help_text="Lista de opciones o botones de respuesta rápida para el cliente, una por línea."
    )
    is_active = models.BooleanField(default=True, verbose_name="Activo")
    canvas_position = models.JSONField(default=dict, blank=True, help_text="Posición X, Y en el canvas UI")
    next_step = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='incoming_static_routes', help_text="Flujo siguiente por defecto")
    button_routes = models.JSONField(default=dict, blank=True, help_text="Mapeo de opciones a IDs de flujos siguientes")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Flujo de WhatsApp"
        verbose_name_plural = "Flujos de WhatsApp"
        ordering = ['trigger_type', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_trigger_type_display()} -> {self.get_action_type_display()})"


class WhatsAppMessage(models.Model):
    SENDER_CHOICES = [
        ('client', 'Cliente'),
        ('assistant', 'Asistente IA'),
        ('operator', 'Operador Humano')
    ]
    phone = models.CharField(max_length=50, help_text="Número de teléfono del remitente o destinatario.")
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True, related_name='whatsapp_messages')
    sender = models.CharField(max_length=20, choices=SENDER_CHOICES, default='client')
    text = models.TextField(help_text="Contenido del mensaje.")
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp']
        verbose_name = "Mensaje de WhatsApp"
        verbose_name_plural = "Mensajes de WhatsApp"

    def __str__(self):
        return f"{self.sender} -> {self.phone} ({self.timestamp})"
        
        
class PortalOffer(models.Model):
    title = models.CharField(max_length=200, verbose_name="Título de la Oferta")
    description = models.TextField(verbose_name="Descripción o Detalles")
    image = models.ImageField(upload_to='portal/offers/', blank=True, null=True, verbose_name="Imagen Promocional")
    valid_until = models.DateField(blank=True, null=True, verbose_name="Válida hasta")
    is_active = models.BooleanField(default=True, verbose_name="Activa")
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = "Oferta del Portal"
        verbose_name_plural = "Ofertas del Portal"
        
    def __str__(self):
        return self.title


class PortalBlogPost(models.Model):
    title = models.CharField(max_length=255, verbose_name="Título del Artículo")
    content = models.TextField(verbose_name="Contenido (Markdown/HTML)")
    author = models.CharField(max_length=100, default="Equipo MecanIA", verbose_name="Autor")
    image = models.ImageField(upload_to='portal/blogs/', blank=True, null=True, verbose_name="Imagen de Portada")
    is_published = models.BooleanField(default=True, verbose_name="Publicado")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = "Post de Blog"
        verbose_name_plural = "Posts de Blog"
        
    def __str__(self):
        return self.title

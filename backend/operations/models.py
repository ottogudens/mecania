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
    address = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    google_maps_link = models.URLField(blank=True, null=True, help_text="Enlace de ubicación en Google Maps")

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
    email = models.EmailField(unique=True, null=True, blank=True)
    phone = models.CharField(
        max_length=20,
        unique=True,
        validators=[RegexValidator(r'^\+?[\d\s\-]{7,20}$', 'Ingrese un número de teléfono válido.')]
    )
    address = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('ADMIN', 'Administrador'),
        ('MECHANIC', 'Mecánico'),
    ]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='MECHANIC')

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
        if not self.description:
            if self.product_id:
                self.description = self.product.name
            elif self.service_id:
                self.description = self.service.name
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantity}x {self.description} (OT-{self.work_order.id})"

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

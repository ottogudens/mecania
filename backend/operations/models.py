from django.db import models
from django.contrib.auth.models import User

class Client(models.Model):
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True, null=True, blank=True)
    phone = models.CharField(max_length=20, unique=True)
    address = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

class Vehicle(models.Model):
    license_plate = models.CharField(max_length=20, unique=True)
    make = models.CharField(max_length=50)
    model = models.CharField(max_length=50)
    year = models.IntegerField()
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='vehicles', null=True, blank=True)
    
    # Legacy fields (will be removed later or ignored)
    owner_name = models.CharField(max_length=100, default='Desconocido')
    owner_phone = models.CharField(max_length=20, default='0000000000')

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
    mileage = models.IntegerField()
    fuel_level = models.IntegerField(help_text="Porcentaje de nivel de combustible (0-100)")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
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
        ('GREEN', 'Bien (Verde)'),
        ('YELLOW', 'Advertencia (Amarillo)'),
        ('RED', 'Crítico (Rojo)'),
    ]

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='inspections')
    category = models.CharField(max_length=100, help_text="Ej., Frenos, Neumáticos, Motor")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    evidence_file = models.FileField(upload_to='inspections/evidence/', null=True, blank=True)
    observations = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.category} - {self.status} (OT-{self.work_order.id})"

from django.db import models

class Vehicle(models.Model):
    license_plate = models.CharField(max_length=20, unique=True)
    make = models.CharField(max_length=50)
    model = models.CharField(max_length=50)
    year = models.IntegerField()

    def __str__(self):
        return f"{self.license_plate} - {self.make} {self.model}"

class WorkOrder(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pendiente'),
        ('IN_PROGRESS', 'En Progreso'),
        ('COMPLETED', 'Completado'),
        ('DELIVERED', 'Entregado'),
    ]

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='work_orders')
    mileage = models.IntegerField()
    fuel_level = models.IntegerField(help_text="Porcentaje de nivel de combustible (0-100)")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"OT-{self.id} / {self.vehicle.license_plate}"

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

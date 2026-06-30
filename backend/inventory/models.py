from django.db import models
from django.core.validators import MinValueValidator

class Product(models.Model):
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=50, unique=True)
    stock_quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    price = models.DecimalField(max_digits=10, decimal_places=2)
    low_stock_threshold = models.IntegerField(default=5, validators=[MinValueValidator(0)])

    def __str__(self):
        return f"{self.name} ({self.sku})"


class ServiceCategory(models.Model):
    """
    Categoría de servicios ofrecidos por el taller (ej. Mantenimiento, Frenos,
    Diagnóstico). Permite agrupar el catálogo de servicios para mostrarlo
    ordenado en el punto de venta y en el frontend de creación de OT.
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        verbose_name = "Categoría de servicio"
        verbose_name_plural = "Categorías de servicio"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Service(models.Model):
    """
    Catálogo de servicios que ofrece el taller (ej. "Cambio de aceite express",
    "Diagnóstico computarizado", "Alineación y balanceo"). A diferencia de un
    Product, un Service no descuenta stock de inventario por sí mismo: es mano
    de obra o un paquete de trabajo con un precio fijo o de referencia.

    Se usa tanto al armar los items de una Orden de Trabajo como en una venta
    de mostrador (sin OT) desde el Punto de Venta.
    """
    name = models.CharField(max_length=200)
    category = models.ForeignKey(
        ServiceCategory, on_delete=models.PROTECT, related_name="services"
    )
    price = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(
        default=True,
        help_text="Servicios inactivos no aparecen como opción nueva, pero se conservan en ventas históricas.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Servicio"
        verbose_name_plural = "Servicios"
        ordering = ["category__name", "name"]

    def __str__(self):
        return f"{self.name} ({self.category.name}) - ${self.price}"


class StockTransaction(models.Model):
    TRANSACTION_TYPES = [
        ('IN', 'Entrada de Stock'),
        ('OUT', 'Salida de Stock (Usado en OT)'),
        ('SALE', 'Salida por Venta de Mostrador'),
        ('ADJUSTMENT', 'Ajuste Manual'),
    ]

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='transactions')
    work_order = models.ForeignKey('operations.WorkOrder', on_delete=models.SET_NULL, null=True, blank=True, related_name='stock_transactions')
    quantity = models.IntegerField()
    transaction_type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.get_transaction_type_display()} - {self.product.name} ({self.quantity})"


from django.db import models
from decimal import Decimal


class Invoice(models.Model):
    """
    Una Invoice representa cualquier cobro del taller, con o sin Orden de
    Trabajo asociada:
    - Si work_order no es null: es el cobro de una OT (sus líneas vienen de
      WorkOrderItem, igual que antes).
    - Si work_order es null: es una venta de mostrador, y sus líneas viven en
      InvoiceLineItem (productos y/o servicios vendidos directamente, sin OT).
    """
    STATUS_CHOICES = [
        ('DRAFT', 'Borrador'),
        ('SENT', 'Enviado al Cliente'),
        ('PARTIALLY_PAID', 'Pago Parcial (Abono)'),
        ('PAID', 'Pagado'),
        ('CANCELLED', 'Cancelado'),
        ('VOID', 'Anulado'),
    ]

    SOURCE_CHOICES = [
        ('WORK_ORDER', 'Orden de Trabajo'),
        ('COUNTER_SALE', 'Venta de Mostrador'),
    ]

    work_order = models.OneToOneField(
        'operations.WorkOrder', on_delete=models.CASCADE, related_name='invoice',
        null=True, blank=True,
    )
    client = models.ForeignKey(
        'operations.Client', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='counter_sale_invoices',
        help_text="Cliente de la venta de mostrador. En ventas anónimas puede quedar vacío.",
    )
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='WORK_ORDER')
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_paid = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text="Suma de los pagos/abonos registrados contra esta factura.",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    cancelled_reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def balance_due(self):
        return self.total_amount - self.amount_paid

    def get_line_items(self):
        """
        Devuelve las líneas de cobro sin importar el origen: si tiene OT,
        las líneas son los WorkOrderItem de esa OT; si es venta de mostrador,
        son sus InvoiceLineItem propios.
        """
        if self.work_order_id:
            return self.work_order.items.all()
        return self.line_items.all()

    def recalculate_totals(self, tax_rate=Decimal('0.19')):
        """
        Recalcula subtotal/impuesto/total a partir de las líneas reales,
        sea OT o venta de mostrador. No toca amount_paid ni status: eso lo
        maneja la capa de servicio (ver finance/services.py) para mantener
        la actualización de stock y de pagos coordinada en una transacción.
        """
        items = self.get_line_items()
        subtotal = sum((item.total_price for item in items), Decimal('0'))
        self.subtotal = subtotal
        self.tax_amount = subtotal * tax_rate
        self.total_amount = self.subtotal + self.tax_amount
        self.save(update_fields=['subtotal', 'tax_amount', 'total_amount', 'updated_at'])

    def __str__(self):
        origen = f"OT-{self.work_order_id}" if self.work_order_id else "Mostrador"
        return f"FACT-{self.id} ({origen})"


class InvoiceLineItem(models.Model):
    """
    Línea de una venta de mostrador (Invoice sin work_order). Puede referenciar
    un Product (descuenta inventario) o un Service (no descuenta inventario,
    es mano de obra/paquete de trabajo), pero no ambos a la vez.
    """
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='line_items')
    product = models.ForeignKey(
        'inventory.Product', on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    service = models.ForeignKey(
        'inventory.Service', on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    description = models.CharField(
        max_length=255, blank=True,
        help_text="Se completa automáticamente desde el producto/servicio si se deja vacío.",
    )
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    @property
    def total_price(self):
        return self.quantity * self.unit_price

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.product_id and self.service_id:
            raise ValidationError("Una línea de venta no puede tener producto y servicio a la vez.")
        if not self.product_id and not self.service_id:
            raise ValidationError("Una línea de venta debe tener un producto o un servicio.")

    def save(self, *args, **kwargs):
        if not self.description:
            if self.product_id:
                self.description = self.product.name
            elif self.service_id:
                self.description = self.service.name
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantity}x {self.description} (FACT-{self.invoice_id})"


class Payment(models.Model):
    METHOD_CHOICES = [
        ('CASH', 'Efectivo'),
        ('CARD', 'Tarjeta de Crédito/Débito'),
        ('TRANSFER', 'Transferencia Bancaria'),
    ]

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    date = models.DateTimeField(auto_now_add=True)
    reference_number = models.CharField(max_length=100, blank=True, help_text="Número de transferencia o voucher")
    registered_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='registered_payments',
    )

    def __str__(self):
        return f"Pago {self.id} - FACT-{self.invoice.id} ({self.amount})"

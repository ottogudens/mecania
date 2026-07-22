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
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="Descuento global aplicado a la factura.")
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
        Recalcula subtotal (neto), impuesto (IVA 19%) y total_amount a partir de las líneas reales,
        considerando los precios de los ítems con IVA incluido y descontando discount_amount.
        """
        items = self.get_line_items()
        gross_items_total = sum((item.total_price for item in items), Decimal('0'))
        
        discount = self.discount_amount or Decimal('0')
        final_total = max(Decimal('0'), gross_items_total - discount)
        
        net_subtotal = round(final_total / (Decimal('1') + tax_rate), 2)
        tax = final_total - net_subtotal
        
        self.subtotal = net_subtotal
        self.tax_amount = tax
        self.total_amount = final_total
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


class Estimate(models.Model):
    client = models.ForeignKey('operations.Client', on_delete=models.CASCADE, related_name='estimates')
    vehicle = models.ForeignKey('operations.Vehicle', on_delete=models.SET_NULL, null=True, blank=True)
    STATUS_CHOICES = [
        ('DRAFT', 'Borrador'),
        ('SENT', 'Enviado'),
        ('ACCEPTED', 'Aceptado'),
        ('REJECTED', 'Rechazado'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    valid_until = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def recalculate_totals(self, tax_rate=Decimal('0.19')):
        items = self.items.all()
        subtotal = sum((item.total_price for item in items), Decimal('0'))
        self.subtotal = subtotal
        self.tax_amount = subtotal * tax_rate
        self.total_amount = self.subtotal + self.tax_amount
        self.save(update_fields=['subtotal', 'tax_amount', 'total_amount', 'updated_at'])

    def __str__(self):
        return f"PRE-{self.id} - {self.client}"

class EstimateLineItem(models.Model):
    estimate = models.ForeignKey(Estimate, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('inventory.Product', on_delete=models.SET_NULL, null=True, blank=True)
    service = models.ForeignKey('inventory.Service', on_delete=models.SET_NULL, null=True, blank=True)
    description = models.CharField(max_length=255, blank=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)

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
        return f"{self.quantity}x {self.description} (PRE-{self.estimate.id})"


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


class CashRegisterSession(models.Model):
    STATUS_CHOICES = [
        ('OPEN', 'Abierta'),
        ('CLOSED', 'Cerrada'),
    ]

    opened_by = models.ForeignKey('auth.User', on_delete=models.PROTECT, related_name='opened_sessions')
    closed_by = models.ForeignKey('auth.User', on_delete=models.PROTECT, related_name='closed_sessions', null=True, blank=True)
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    opening_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN')
    
    # Declarado por el usuario al cerrar
    closing_cash = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    closing_card = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    closing_transfer = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    
    closing_notes = models.TextField(blank=True)

    def __str__(self):
        return f"Caja {self.id} ({self.get_status_display()}) - Abierta el {self.opened_at.strftime('%d/%m/%Y %H:%M')}"


class Supplier(models.Model):
    rut = models.CharField(max_length=20, unique=True, help_text="RUT de la empresa proveedora")
    company_name = models.CharField(max_length=255, help_text="Razón Social / Nombre")
    email = models.EmailField(blank=True, null=True)
    contact_name = models.CharField(max_length=255, blank=True, help_text="Nombre del vendedor / contacto")
    contact_phone = models.CharField(max_length=50, blank=True, help_text="Teléfono del vendedor")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.company_name} ({self.rut})"


class SupplierInvoice(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pendiente'),
        ('PARTIALLY_PAID', 'Pago Parcial'),
        ('PAID', 'Pagada'),
        ('CANCELLED', 'Anulada'),
    ]
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='invoices')
    invoice_number = models.CharField(max_length=50, help_text="Número / Folio de la Factura")
    description = models.TextField(blank=True)
    emission_date = models.DateField()
    due_date = models.DateField()
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    xml_or_pdf_data = models.TextField(blank=True, help_text="Datos crudos JSON extraídos del DTE o PDF")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"FACT-PROV-{self.invoice_number} - {self.supplier.company_name}"


class SupplierInvoiceItem(models.Model):
    invoice = models.ForeignKey(SupplierInvoice, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('inventory.Product', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_cost_price = models.DecimalField(max_digits=12, decimal_places=2, help_text="Precio de costo unitario neto sin impuesto")

    @property
    def total_cost(self):
        return self.quantity * self.unit_cost_price

    def __str__(self):
        return f"{self.quantity}x {self.description} (${self.unit_cost_price})"


class SupplierPaymentDocument(models.Model):
    TYPE_CHOICES = [
        ('CHECK', 'Cheque'),
        ('TRANSFER', 'Transferencia'),
        ('CASH', 'Efectivo'),
        ('OTHER', 'Otro'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pendiente de Cobro'),
        ('PAID', 'Cobrado/Pagado'),
        ('BOUNCED', 'Rebotado'),
        ('CANCELLED', 'Anulado'),
    ]
    invoice = models.ForeignKey(SupplierInvoice, on_delete=models.CASCADE, related_name='payment_documents')
    document_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='CHECK')
    document_number = models.CharField(max_length=100, blank=True, help_text="Número de cheque o código de operación")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField(help_text="Fecha programada de cobro/pago")
    bank = models.CharField(max_length=100, blank=True, help_text="Banco emisor (para cheques)")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.get_document_type_display()} {self.document_number or ''} - {self.amount} ({self.status})"


class CashMovement(models.Model):
    TYPE_CHOICES = [
        ('IN', 'Ingreso'),
        ('OUT', 'Egreso'),
    ]
    session = models.ForeignKey(
        CashRegisterSession, on_delete=models.CASCADE, related_name='movements',
        null=True, blank=True, help_text="Sesión de caja activa en el turno de trabajo"
    )
    movement_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=255)
    date = models.DateTimeField(auto_now_add=True)
    registered_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='registered_movements'
    )

    def __str__(self):
        return f"{self.get_movement_type_display()} - {self.description} ({self.amount})"


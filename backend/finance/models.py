from django.db import models
from decimal import Decimal

class Invoice(models.Model):
    STATUS_CHOICES = [
        ('DRAFT', 'Borrador'),
        ('SENT', 'Enviado al Cliente'),
        ('PAID', 'Pagado'),
        ('VOID', 'Anulado'),
    ]

    work_order = models.OneToOneField('operations.WorkOrder', on_delete=models.CASCADE, related_name='invoice')
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    created_at = models.DateTimeField(auto_now_add=True)

    def calculate_totals(self, tax_rate=Decimal('0.19')):
        # Calcula el subtotal sumando todos los items de la orden de trabajo
        items = self.work_order.items.all()
        subtotal = sum(item.total_price for item in items)
        
        self.subtotal = subtotal
        self.tax_amount = subtotal * tax_rate
        self.total_amount = self.subtotal + self.tax_amount
        self.save()

    def __str__(self):
        return f"FACT-{self.id} de OT-{self.work_order.id}"

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

    def __str__(self):
        return f"Pago {self.id} - FACT-{self.invoice.id} ({self.amount})"

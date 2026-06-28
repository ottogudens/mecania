from django.db import models
from operations.models import WorkOrder

class Invoice(models.Model):
    STATUS_CHOICES = [
        ('DRAFT', 'Borrador'),
        ('SENT', 'Enviado al Cliente'),
        ('PAID', 'Pagado'),
        ('VOID', 'Anulado'),
    ]

    work_order = models.OneToOneField(WorkOrder, on_delete=models.CASCADE, related_name='invoice')
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    created_at = models.DateTimeField(auto_now_add=True)

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
    method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    date = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Pago de {self.amount} para FACT-{self.invoice.id}"

from django.db import models

class Product(models.Model):
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=50, unique=True)
    stock_quantity = models.IntegerField(default=0)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    low_stock_threshold = models.IntegerField(default=5)

    def __str__(self):
        return f"{self.name} ({self.sku})"

class StockTransaction(models.Model):
    TRANSACTION_TYPES = [
        ('IN', 'Entrada de Stock'),
        ('OUT', 'Salida de Stock (Usado en OT)'),
    ]

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='transactions')
    work_order = models.ForeignKey('operations.WorkOrder', on_delete=models.SET_NULL, null=True, blank=True, related_name='stock_transactions')
    quantity = models.IntegerField()
    transaction_type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        # Auto-update stock logic could go here
        super().save(*args, **kwargs)

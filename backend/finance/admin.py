from django.contrib import admin

from .models import Invoice, InvoiceLineItem, Payment


class InvoiceLineItemInline(admin.TabularInline):
    model = InvoiceLineItem
    extra = 0


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ['date']


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['id', 'source', 'work_order', 'status', 'total_amount', 'amount_paid', 'created_at']
    list_filter = ['source', 'status']
    inlines = [InvoiceLineItemInline, PaymentInline]


admin.site.register(Payment)

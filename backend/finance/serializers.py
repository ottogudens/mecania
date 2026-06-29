from rest_framework import serializers

from .models import Invoice, InvoiceLineItem, Payment


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    total_price = serializers.ReadOnlyField()
    product_name = serializers.CharField(source='product.name', read_only=True, default=None)
    service_name = serializers.CharField(source='service.name', read_only=True, default=None)

    class Meta:
        model = InvoiceLineItem
        fields = [
            'id', 'invoice', 'product', 'product_name', 'service', 'service_name',
            'description', 'quantity', 'unit_price', 'total_price',
        ]


class PaymentSerializer(serializers.ModelSerializer):
    registered_by_username = serializers.CharField(source='registered_by.username', read_only=True, default=None)

    class Meta:
        model = Payment
        fields = [
            'id', 'invoice', 'amount', 'payment_method', 'date',
            'reference_number', 'registered_by', 'registered_by_username',
        ]
        read_only_fields = ['date']


class InvoiceSerializer(serializers.ModelSerializer):
    payments = PaymentSerializer(many=True, read_only=True)
    line_items = InvoiceLineItemSerializer(many=True, read_only=True)
    balance_due = serializers.ReadOnlyField()
    client_name = serializers.SerializerMethodField()
    vehicle_license_plate = serializers.CharField(
        source='work_order.vehicle.license_plate', read_only=True, default=None
    )

    class Meta:
        model = Invoice
        fields = [
            'id', 'work_order', 'client', 'client_name', 'vehicle_license_plate', 'source',
            'subtotal', 'tax_amount', 'total_amount', 'amount_paid', 'balance_due',
            'status', 'cancelled_reason', 'created_at', 'updated_at',
            'payments', 'line_items',
        ]
        read_only_fields = [
            'subtotal', 'tax_amount', 'total_amount', 'amount_paid',
            'status', 'created_at', 'updated_at',
        ]

    def get_client_name(self, obj):
        # Venta de mostrador con cliente asociado
        if obj.client_id:
            return f"{obj.client.first_name} {obj.client.last_name}"
        # Factura de OT: el cliente viene del vehículo
        if obj.work_order_id and obj.work_order.vehicle.client_id:
            c = obj.work_order.vehicle.client
            return f"{c.first_name} {c.last_name}"
        return None

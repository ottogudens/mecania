from rest_framework import serializers

from .models import (
    Invoice, InvoiceLineItem, Payment, Estimate, EstimateLineItem, CashRegisterSession,
    Supplier, SupplierInvoice, SupplierPaymentDocument, CashMovement
)

class EstimateLineItemSerializer(serializers.ModelSerializer):
    total_price = serializers.ReadOnlyField()
    product_name = serializers.CharField(source='product.name', read_only=True, default=None)
    service_name = serializers.CharField(source='service.name', read_only=True, default=None)

    class Meta:
        model = EstimateLineItem
        fields = [
            'id', 'estimate', 'product', 'product_name', 'service', 'service_name',
            'description', 'quantity', 'unit_price', 'total_price',
        ]

class EstimateSerializer(serializers.ModelSerializer):
    items = EstimateLineItemSerializer(many=True, read_only=True)
    client_name = serializers.CharField(source='client.first_name', read_only=True)
    client_last_name = serializers.CharField(source='client.last_name', read_only=True)
    vehicle_license_plate = serializers.CharField(source='vehicle.license_plate', read_only=True, default=None)

    class Meta:
        model = Estimate
        fields = [
            'id', 'client', 'client_name', 'client_last_name', 'vehicle', 'vehicle_license_plate',
            'status', 'subtotal', 'tax_amount', 'total_amount', 'valid_until',
            'created_at', 'updated_at', 'items',
        ]
        read_only_fields = ['subtotal', 'tax_amount', 'total_amount', 'created_at', 'updated_at']

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
    items = serializers.SerializerMethodField()
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
            'payments', 'line_items', 'items',
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

    def get_items(self, obj):
        from operations.serializers import WorkOrderItemSerializer
        if obj.work_order_id:
            return WorkOrderItemSerializer(obj.work_order.items.all(), many=True).data
        else:
            return InvoiceLineItemSerializer(obj.line_items.all(), many=True).data


class CashMovementSerializer(serializers.ModelSerializer):
    registered_by_username = serializers.CharField(source='registered_by.username', read_only=True, default=None)

    class Meta:
        model = CashMovement
        fields = [
            'id', 'session', 'movement_type', 'amount', 'description', 'date',
            'registered_by', 'registered_by_username'
        ]
        read_only_fields = ['date', 'registered_by']


class CashRegisterSessionSerializer(serializers.ModelSerializer):
    opened_by_username = serializers.CharField(source='opened_by.username', read_only=True)
    closed_by_username = serializers.CharField(source='closed_by.username', read_only=True, default=None)
    movements = CashMovementSerializer(many=True, read_only=True)
    total_inflow = serializers.SerializerMethodField()
    total_outflow = serializers.SerializerMethodField()

    class Meta:
        model = CashRegisterSession
        fields = [
            'id', 'opened_by', 'opened_by_username', 'closed_by', 'closed_by_username',
            'opened_at', 'closed_at', 'opening_amount', 'status',
            'closing_cash', 'closing_card', 'closing_transfer', 'closing_notes',
            'movements', 'total_inflow', 'total_outflow'
        ]
        read_only_fields = ['opened_at', 'closed_at', 'opened_by', 'closed_by', 'status']

    def get_total_inflow(self, obj):
        return sum(m.amount for m in obj.movements.filter(movement_type='IN'))

    def get_total_outflow(self, obj):
        return sum(m.amount for m in obj.movements.filter(movement_type='OUT'))


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'


class SupplierPaymentDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierPaymentDocument
        fields = '__all__'


class SupplierInvoiceSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.company_name', read_only=True, default=None)
    payment_documents = SupplierPaymentDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = SupplierInvoice
        fields = '__all__'


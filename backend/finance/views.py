from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from operations.models import WorkOrder
from .models import Invoice, InvoiceLineItem, Payment
from .serializers import InvoiceSerializer, PaymentSerializer
from .services import (
    POSError,
    get_or_create_invoice_for_work_order,
    charge_invoice,
    cancel_invoice,
    create_counter_sale,
)


class InvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Solo lectura: las facturas se crean y modifican exclusivamente a través
    de los endpoints del POS (POSWorkOrderLookupView, POSChargeView,
    POSCancelInvoiceView, POSCounterSaleView), nunca por create/update
    genérico, para que toda la lógica de stock y totales pase siempre por
    finance/services.py.
    """
    permission_classes = [IsAuthenticated]
    queryset = Invoice.objects.all().order_by('-created_at')
    serializer_class = InvoiceSerializer


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """Solo lectura — los pagos se crean vía POSChargeView."""
    permission_classes = [IsAuthenticated]
    queryset = Payment.objects.all().order_by('-date')
    serializer_class = PaymentSerializer


class POSWorkOrderLookupView(APIView):
    """
    Punto de entrada del POS para cobrar una Orden de Trabajo existente.
    Busca la OT por id o por patente del vehículo, y devuelve (creando si
    no existe todavía) su factura actualizada, lista para cobrar o abonar.

    GET /api/finance/pos/work-order-lookup/?work_order_id=12
    GET /api/finance/pos/work-order-lookup/?license_plate=ABCD12
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        work_order_id = request.query_params.get('work_order_id')
        license_plate = request.query_params.get('license_plate')

        if work_order_id:
            work_order = WorkOrder.objects.filter(id=work_order_id).first()
        elif license_plate:
            work_order = (
                WorkOrder.objects.filter(vehicle__license_plate__iexact=license_plate)
                .exclude(status='CANCELLED')
                .order_by('-created_at')
                .first()
            )
        else:
            return Response(
                {'error': "Debes indicar 'work_order_id' o 'license_plate'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not work_order:
            return Response({'error': 'Orden de trabajo no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        invoice = get_or_create_invoice_for_work_order(work_order)
        return Response(InvoiceSerializer(invoice).data)


class POSChargeView(APIView):
    """
    Registra un cobro (total o parcial/abono) contra una factura existente.

    POST /api/finance/pos/charge/
    body: {"invoice_id": 5, "amount": 15000, "payment_method": "CASH", "reference_number": ""}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        invoice_id = request.data.get('invoice_id')
        amount = request.data.get('amount')
        payment_method = request.data.get('payment_method')

        if not all([invoice_id, amount, payment_method]):
            return Response(
                {'error': "Se requieren 'invoice_id', 'amount' y 'payment_method'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            amount = Decimal(str(amount))
        except InvalidOperation:
            return Response({'error': "'amount' no es un número válido."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            invoice, payment = charge_invoice(
                invoice_id=invoice_id,
                amount=amount,
                payment_method=payment_method,
                reference_number=request.data.get('reference_number', ''),
                registered_by=request.user if request.user.is_authenticated else None,
            )
        except Invoice.DoesNotExist:
            return Response({'error': 'Factura no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        except POSError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'invoice': InvoiceSerializer(invoice).data,
            'payment': PaymentSerializer(payment).data,
        })


class POSCancelInvoiceView(APIView):
    """
    Cancela una factura (OT o venta de mostrador). Si era venta de mostrador
    con productos, revierte el stock descontado.

    POST /api/finance/pos/cancel-invoice/
    body: {"invoice_id": 5, "reason": "Cliente cambió de opinión"}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        invoice_id = request.data.get('invoice_id')
        if not invoice_id:
            return Response({'error': "Se requiere 'invoice_id'."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            invoice = cancel_invoice(invoice_id=invoice_id, reason=request.data.get('reason', ''))
        except Invoice.DoesNotExist:
            return Response({'error': 'Factura no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        except POSError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(InvoiceSerializer(invoice).data)


class POSCounterSaleView(APIView):
    """
    Crea una venta de mostrador (sin Orden de Trabajo), mezclando productos
    de inventario y servicios del catálogo.

    POST /api/finance/pos/counter-sale/
    body: {
        "client_id": 3,            # opcional
        "items": [
            {"product_id": 7, "quantity": 2},
            {"service_id": 1, "quantity": 1, "unit_price": 9990}
        ]
    }
    La venta queda creada con status 'SENT', lista para cobrar con
    POSChargeView usando el invoice_id que se devuelve aquí.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        items = request.data.get('items')
        if not items or not isinstance(items, list):
            return Response(
                {'error': "Se requiere 'items' como una lista de productos/servicios."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            invoice = create_counter_sale(
                client_id=request.data.get('client_id'),
                items=items,
            )
        except POSError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)

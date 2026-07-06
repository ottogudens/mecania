from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from django.utils import timezone
from operations.models import WorkOrder
from .models import (
    Invoice, InvoiceLineItem, Payment, CashRegisterSession,
    Supplier, SupplierInvoice, SupplierPaymentDocument, CashMovement
)
from .serializers import (
    InvoiceSerializer, PaymentSerializer, CashRegisterSessionSerializer,
    SupplierSerializer, SupplierInvoiceSerializer, SupplierPaymentDocumentSerializer, CashMovementSerializer
)
import io
import xml.etree.ElementTree as ET
import base64
import json
from pypdf import PdfReader
from openai import OpenAI
import os
from django.db import transaction
from django.db.models import Sum
from datetime import date, timedelta
from .services import (
    POSError,
    get_or_create_invoice_for_work_order,
    charge_invoice,
    cancel_invoice,
    create_counter_sale,
)
from rest_framework.decorators import action

class CashRegisterViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = CashRegisterSession.objects.all().order_by('-opened_at')
    serializer_class = CashRegisterSessionSerializer

    @action(detail=False, methods=['get'])
    def current(self, request):
        """Obtiene la sesión de caja actualmente abierta."""
        current_session = CashRegisterSession.objects.filter(status='OPEN').first()
        if not current_session:
            return Response(None, status=status.HTTP_200_OK)
        return Response(CashRegisterSessionSerializer(current_session).data)

    @action(detail=False, methods=['post'])
    def open_session(self, request):
        """Abre una nueva sesión de caja."""
        # Verificar si ya existe una abierta
        if CashRegisterSession.objects.filter(status='OPEN').exists():
            return Response({'error': 'Ya existe una sesión de caja abierta.'}, status=status.HTTP_400_BAD_REQUEST)
        
        opening_amount = request.data.get('opening_amount', 0)
        try:
            opening_amount = Decimal(str(opening_amount))
        except (InvalidOperation, ValueError):
            return Response({'error': 'Monto inicial inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        session = CashRegisterSession.objects.create(
            opened_by=request.user,
            opening_amount=opening_amount,
            status='OPEN'
        )
        return Response(CashRegisterSessionSerializer(session).data, status=status.HTTP_201_CREATED)

    def get_session_stats(self, session):
        """Calcula los totales esperados en base a los pagos de la sesión y movimientos manuales."""
        payments = Payment.objects.filter(date__gte=session.opened_at)
        if session.closed_at:
            payments = payments.filter(date__lte=session.closed_at)
        
        # Agrupar por método de pago
        cash_total = Decimal('0.00')
        card_total = Decimal('0.00')
        transfer_total = Decimal('0.00')

        for p in payments:
            if p.payment_method == 'CASH':
                cash_total += p.amount
            elif p.payment_method == 'CARD':
                card_total += p.amount
            elif p.payment_method == 'TRANSFER':
                transfer_total += p.amount

        # Movimientos de caja manuales
        movements = CashMovement.objects.filter(session=session)
        inflow = sum((m.amount for m in movements if m.movement_type == 'IN'), Decimal('0.00'))
        outflow = sum((m.amount for m in movements if m.movement_type == 'OUT'), Decimal('0.00'))

        return {
            'opening_amount': float(session.opening_amount),
            'expected_cash': float(cash_total),
            'expected_card': float(card_total),
            'expected_transfer': float(transfer_total),
            'inbound_movements': float(inflow),
            'outbound_movements': float(outflow),
            'expected_total': float(session.opening_amount + cash_total + card_total + transfer_total + inflow - outflow),
            'expected_cash_drawer': float(session.opening_amount + cash_total + inflow - outflow)
        }

    @action(detail=False, methods=['get'], url_path='x-report')
    def x_report(self, request):
        """Genera el reporte X para la caja abierta actual (sin cerrarla)."""
        session = CashRegisterSession.objects.filter(status='OPEN').first()
        if not session:
            return Response({'error': 'No hay ninguna sesión de caja abierta para generar reporte X.'}, status=status.HTTP_400_BAD_REQUEST)
        
        stats = self.get_session_stats(session)
        # Traer listado de transacciones/pagos detallados
        payments = Payment.objects.filter(date__gte=session.opened_at).order_by('-date')
        stats['payments'] = PaymentSerializer(payments, many=True).data
        stats['session'] = CashRegisterSessionSerializer(session).data
        return Response(stats)

    @action(detail=True, methods=['post'])
    def close_session(self, request, pk=None):
        """Cierra la sesión de caja especificada, declarando montos físicos."""
        session = self.get_object()
        if session.status == 'CLOSED':
            return Response({'error': 'Esta sesión ya está cerrada.'}, status=status.HTTP_400_BAD_REQUEST)

        closing_cash = request.data.get('closing_cash', 0)
        closing_card = request.data.get('closing_card', 0)
        closing_transfer = request.data.get('closing_transfer', 0)
        closing_notes = request.data.get('closing_notes', '')

        try:
            session.closing_cash = Decimal(str(closing_cash))
            session.closing_card = Decimal(str(closing_card))
            session.closing_transfer = Decimal(str(closing_transfer))
        except (InvalidOperation, ValueError):
            return Response({'error': 'Montos de cierre inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        session.closed_by = request.user
        session.closed_at = timezone.now()
        session.closing_notes = closing_notes
        session.status = 'CLOSED'
        session.save()

        return Response(CashRegisterSessionSerializer(session).data)

    @action(detail=True, methods=['get'])
    def z_report(self, request, pk=None):
        """Reporte detallado de cierre Z para una sesión cerrada."""
        session = self.get_object()
        stats = self.get_session_stats(session)
        payments = Payment.objects.filter(date__gte=session.opened_at)
        if session.closed_at:
            payments = payments.filter(date__lte=session.closed_at)
        stats['payments'] = PaymentSerializer(payments.order_by('-date'), many=True).data
        stats['session'] = CashRegisterSessionSerializer(session).data
        return Response(stats)



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

    @action(detail=False, methods=['get'], pagination_class=None)
    def active_pos(self, request):
        """
        Retorna todas las facturas asociadas a órdenes de trabajo activas,
        y también realiza la sincronización de las mismas antes de retornar.
        """
        try:
            active_wos = WorkOrder.objects.exclude(status__in=['DELIVERED', 'CANCELLED'])
            for wo in active_wos:
                get_or_create_invoice_for_work_order(wo)
        except POSError:
            # Si la caja no está abierta, no forzamos la sincronización de facturas,
            # pero igual retornamos las pre-existentes de OTs activas.
            pass
            
        active_invoices = Invoice.objects.filter(
            work_order__status__in=['PENDING', 'IN_PROGRESS', 'COMPLETED']
        ).order_by('-created_at')
        
        serializer = self.get_serializer(active_invoices, many=True)
        return Response(serializer.data)


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
            work_order = WorkOrder.objects.filter(id=work_order_id).exclude(status__in=['DELIVERED', 'CANCELLED']).first()
        elif license_plate:
            work_order = (
                WorkOrder.objects.filter(vehicle__license_plate__iexact=license_plate)
                .exclude(status__in=['DELIVERED', 'CANCELLED'])
                .order_by('-created_at')
                .first()
            )
        else:
            return Response(
                {'error': "Debes indicar 'work_order_id' o 'license_plate'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not work_order:
            return Response({'error': 'Orden de trabajo activa no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

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


class InvoicePDFView(APIView):
    """
    Genera un PDF de boleta/factura para cualquier Invoice (OT o mostrador).
    GET /api/finance/invoices/<id>/pdf/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        from decimal import Decimal
        import io
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors

        try:
            invoice = Invoice.objects.get(pk=pk)
        except Invoice.DoesNotExist:
            from rest_framework.response import Response
            from rest_framework import status as drf_status
            return Response({'error': 'Factura no encontrada.'}, status=drf_status.HTTP_404_NOT_FOUND)

        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        W, H = letter  # 612 x 792 pts

        # ── encabezado ──────────────────────────────────────────────────────
        p.setFillColorRGB(0.07, 0.07, 0.1)
        p.rect(0, H - 90, W, 90, fill=1, stroke=0)

        p.setFillColorRGB(0.4, 0.98, 0.95)
        p.setFont("Helvetica-Bold", 26)
        p.drawString(45, H - 48, "MecanIA")

        p.setFillColorRGB(0.77, 0.77, 0.78)
        p.setFont("Helvetica", 10)
        p.drawString(45, H - 66, "Taller Automotriz Inteligente")

        # número de documento
        doc_label = f"BOLETA #{invoice.id}"
        p.setFillColorRGB(1, 1, 1)
        p.setFont("Helvetica-Bold", 13)
        p.drawRightString(W - 45, H - 42, doc_label)
        p.setFont("Helvetica", 9)
        p.setFillColorRGB(0.77, 0.77, 0.78)
        p.drawRightString(W - 45, H - 58, invoice.created_at.strftime("%d/%m/%Y %H:%M"))

        # ── origen ───────────────────────────────────────────────────────────
        y = H - 115
        p.setFillColorRGB(0.07, 0.07, 0.1)
        p.rect(40, y - 8, W - 80, 26, fill=1, stroke=0)
        p.setFillColorRGB(0.4, 0.98, 0.95)
        p.setFont("Helvetica-Bold", 10)
        origen = (
            f"Orden de Trabajo #{invoice.work_order_id}"
            if invoice.work_order_id
            else "Venta de Mostrador"
        )
        p.drawString(50, y + 4, origen.upper())
        if invoice.work_order_id:
            plate = invoice.work_order.vehicle.license_plate if invoice.work_order else "–"
            p.setFillColorRGB(0.77, 0.77, 0.78)
            p.setFont("Helvetica", 9)
            p.drawRightString(W - 50, y + 4, f"Patente: {plate}")

        # ── cliente ──────────────────────────────────────────────────────────
        y -= 40
        p.setFillColorRGB(0.2, 0.2, 0.25)
        p.setFont("Helvetica-Bold", 9)
        p.drawString(50, y, "CLIENTE")
        p.setFillColorRGB(0.93, 0.93, 0.94)
        p.setFont("Helvetica", 10)
        client_name = "–"
        if invoice.client_id:
            c = invoice.client
            client_name = f"{c.first_name} {c.last_name}"
        elif invoice.work_order_id and invoice.work_order.vehicle.client_id:
            c = invoice.work_order.vehicle.client
            client_name = f"{c.first_name} {c.last_name}"
        p.drawString(50, y - 14, client_name)

        # ── separador ────────────────────────────────────────────────────────
        y -= 40
        p.setStrokeColorRGB(0.27, 0.64, 0.62)
        p.setLineWidth(0.5)
        p.line(40, y, W - 40, y)

        # ── cabecera de tabla ─────────────────────────────────────────────────
        y -= 18
        p.setFillColorRGB(0.13, 0.16, 0.20)
        p.rect(40, y - 6, W - 80, 20, fill=1, stroke=0)
        p.setFillColorRGB(0.4, 0.98, 0.95)
        p.setFont("Helvetica-Bold", 9)
        cols = [(50, "DESCRIPCIÓN"), (330, "CANT."), (390, "P. UNITARIO"), (490, "TOTAL")]
        for cx, lbl in cols:
            p.drawString(cx, y + 2, lbl)

        # ── ítems ─────────────────────────────────────────────────────────────
        items = list(invoice.get_line_items())
        y -= 22
        p.setFont("Helvetica", 9)
        row_fill = [(0.97, 0.97, 0.98), (1, 1, 1)]
        for idx, item in enumerate(items):
            row_h = 18
            p.setFillColorRGB(*row_fill[idx % 2])
            p.rect(40, y - 4, W - 80, row_h, fill=1, stroke=0)
            p.setFillColorRGB(0.1, 0.1, 0.12)
            desc = getattr(item, 'description', '') or ''
            if not desc:
                # WorkOrderItem: usa product o description
                desc = getattr(item, 'description', str(item))
            p.drawString(50, y + 2, str(desc)[:48])
            qty = item.quantity if hasattr(item, 'quantity') else 1
            up = item.unit_price
            tot = item.total_price
            p.drawString(335, y + 2, str(qty))
            p.drawRightString(475, y + 2, f"${int(up):,}")
            p.setFillColorRGB(0.07, 0.49, 0.47)
            p.setFont("Helvetica-Bold", 9)
            p.drawRightString(W - 48, y + 2, f"${int(tot):,}")
            p.setFont("Helvetica", 9)
            y -= row_h

        # ── totales ───────────────────────────────────────────────────────────
        y -= 14
        p.setStrokeColorRGB(0.27, 0.64, 0.62)
        p.line(40, y, W - 40, y)

        totals = [
            ("Subtotal", invoice.subtotal),
            ("IVA (19%)", invoice.tax_amount),
        ]
        p.setFont("Helvetica", 10)
        for lbl, val in totals:
            y -= 18
            p.setFillColorRGB(0.4, 0.4, 0.45)
            p.drawRightString(W - 120, y, lbl)
            p.setFillColorRGB(0.1, 0.1, 0.12)
            p.drawRightString(W - 48, y, f"${int(val):,}")

        y -= 6
        p.setStrokeColorRGB(0.07, 0.07, 0.1)
        p.setLineWidth(1)
        p.line(W - 200, y, W - 40, y)
        y -= 20
        p.setFont("Helvetica-Bold", 13)
        p.setFillColorRGB(0.07, 0.07, 0.1)
        p.drawRightString(W - 120, y, "TOTAL")
        p.setFillColorRGB(0.07, 0.49, 0.47)
        p.drawRightString(W - 48, y, f"${int(invoice.total_amount):,}")

        # ── estado de pago ────────────────────────────────────────────────────
        if invoice.status == 'PAID':
            y -= 28
            p.setFillColorRGB(0.18, 0.78, 0.44)
            p.roundRect(W - 160, y - 4, 118, 22, 6, fill=1, stroke=0)
            p.setFillColorRGB(1, 1, 1)
            p.setFont("Helvetica-Bold", 11)
            p.drawCentredString(W - 101, y + 3, "✓ PAGADO")
        elif invoice.status == 'PARTIALLY_PAID':
            y -= 28
            p.setFillColorRGB(0.94, 0.77, 0.06)
            p.roundRect(W - 175, y - 4, 133, 22, 6, fill=1, stroke=0)
            p.setFillColorRGB(0.1, 0.1, 0.1)
            p.setFont("Helvetica-Bold", 10)
            p.drawCentredString(W - 108, y + 3, f"ABONO: ${int(invoice.amount_paid):,}")

        # ── pie ───────────────────────────────────────────────────────────────
        p.setFillColorRGB(0.07, 0.07, 0.1)
        p.rect(0, 0, W, 36, fill=1, stroke=0)
        p.setFillColorRGB(0.4, 0.4, 0.45)
        p.setFont("Helvetica", 8)
        p.drawCentredString(W / 2, 14, "MecanIA — Taller Automotriz Inteligente | Documento generado electrónicamente")

        p.showPage()
        p.save()
        buffer.seek(0)

        from django.http import HttpResponse
        resp = HttpResponse(buffer, content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="Boleta_{invoice.id}.pdf"'
        return resp


from rest_framework.decorators import action
from rest_framework import viewsets
from django.shortcuts import get_object_or_404
from django.db import transaction
from .models import Estimate, EstimateLineItem
from .serializers import EstimateSerializer, EstimateLineItemSerializer
from operations.models import WorkshopSettings
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import io
import requests

class EstimateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Estimate.objects.all().order_by('-created_at')
    serializer_class = EstimateSerializer

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        data = request.data
        estimate = Estimate.objects.create(
            client_id=data['client_id'],
            vehicle_id=data.get('vehicle_id'),
            valid_until=data.get('valid_until')
        )
        
        items_data = data.get('items', [])
        for item_data in items_data:
            EstimateLineItem.objects.create(
                estimate=estimate,
                product_id=item_data.get('product_id'),
                service_id=item_data.get('service_id'),
                description=item_data.get('description', ''),
                quantity=item_data.get('quantity', 1),
                unit_price=item_data.get('unit_price', 0)
            )
        
        estimate.recalculate_totals()
        return Response(EstimateSerializer(estimate).data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        estimate = self.get_object()
        data = request.data
        
        estimate.client_id = data.get('client_id', estimate.client_id)
        estimate.vehicle_id = data.get('vehicle_id', estimate.vehicle_id)
        estimate.valid_until = data.get('valid_until', estimate.valid_until)
        if 'status' in data:
            estimate.status = data.get('status')
        estimate.save()
        
        if 'items' in data:
            # Delete old items and recreate
            estimate.items.all().delete()
            items_data = data.get('items', [])
            for item_data in items_data:
                EstimateLineItem.objects.create(
                    estimate=estimate,
                    product_id=item_data.get('product_id'),
                    service_id=item_data.get('service_id'),
                    description=item_data.get('description', ''),
                    quantity=item_data.get('quantity', 1),
                    unit_price=item_data.get('unit_price', 0)
                )
        
        estimate.recalculate_totals()
        return Response(EstimateSerializer(estimate).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def convert_to_work_order(self, request, pk=None):
        estimate = self.get_object()
        if estimate.status in ['ACCEPTED', 'REJECTED']:
            return Response({'error': 'Estimate already processed'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not estimate.vehicle_id:
            return Response({'error': 'Cannot convert estimate without a vehicle to a work order'}, status=status.HTTP_400_BAD_REQUEST)

        # Create WorkOrder
        from operations.models import WorkOrder, WorkOrderItem
        work_order = WorkOrder.objects.create(
            vehicle=estimate.vehicle,
            mileage=0,
            fuel_level=0,
            status='PENDING'
        )

        for item in estimate.items.all():
            WorkOrderItem.objects.create(
                work_order=work_order,
                product=item.product,
                service=item.service,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                is_labor=bool(item.service_id)
            )
        
        estimate.status = 'ACCEPTED'
        estimate.save(update_fields=['status'])
        
        return Response({'success': True, 'work_order_id': work_order.id})

    @action(detail=True, methods=['post'])
    def share_whatsapp(self, request, pk=None):
        estimate = self.get_object()
        if not estimate.client.phone:
            return Response({'error': 'Client has no phone number'}, status=status.HTTP_400_BAD_REQUEST)
        
        text = f"¡Hola {estimate.client.first_name}! Te compartimos el presupuesto PRE-{estimate.id} por un total de ${estimate.total_amount}. Puedes revisarlo en el documento adjunto."
        
        # Build absolute URL for the PDF
        document_url = request.build_absolute_uri(f'/api/finance/estimates/{estimate.id}/pdf/')
        
        import os
        base_whatsapp_url = os.environ.get('WHATSAPP_SERVICE_URL', 'http://localhost:3001')
        whatsapp_service_url = f"{base_whatsapp_url.rstrip('/')}/api/send-message"
        
        try:
            resp = requests.post(whatsapp_service_url, json={
                "number": estimate.client.phone,
                "text": text,
                "documentUrl": document_url,
                "fileName": f"Presupuesto_{estimate.id}.pdf"
            }, timeout=10)
            if resp.status_code == 200:
                estimate.status = 'SENT'
                estimate.save(update_fields=['status'])
                return Response({'success': True})
            else:
                return Response({'error': 'Failed to send via WhatsApp'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        estimate = self.get_object()
        
        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        
        # Draw header with logo
        settings = WorkshopSettings.load()
        if settings.logo:
            try:
                p.drawImage(settings.logo.path, 50, 700, width=100, preserveAspectRatio=True, mask='auto')
            except Exception:
                pass
                
        p.setFont("Helvetica-Bold", 24)
        p.drawString(160, 750, settings.name)
        p.setFont("Helvetica", 12)
        p.drawString(160, 730, f"Teléfono: {settings.phone} | Email: {settings.email}")
        p.drawString(160, 715, settings.address)
        
        p.setFont("Helvetica-Bold", 16)
        p.drawString(50, 660, f"Presupuesto #{estimate.id}")
        
        p.setFont("Helvetica", 12)
        p.drawString(50, 630, f"Cliente: {estimate.client.first_name} {estimate.client.last_name}")
        if estimate.vehicle:
            p.drawString(50, 610, f"Vehículo: {estimate.vehicle.make} {estimate.vehicle.model} - Patente: {estimate.vehicle.license_plate}")
        p.drawString(400, 630, f"Fecha: {estimate.created_at.strftime('%Y-%m-%d')}")
        
        y = 570
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, "Descripción")
        p.drawString(300, y, "Cantidad")
        p.drawString(400, y, "Precio Unit.")
        p.drawString(500, y, "Total")
        p.line(50, y-5, 550, y-5)
        
        y -= 25
        p.setFont("Helvetica", 12)
        for item in estimate.items.all():
            p.drawString(50, y, str(item.description)[:35])
            p.drawString(300, y, str(item.quantity))
            p.drawString(400, y, f"${item.unit_price}")
            p.drawString(500, y, f"${item.total_price}")
            y -= 20
        
        p.line(50, y-5, 550, y-5)
        y -= 25
        p.setFont("Helvetica-Bold", 14)
        p.drawString(380, y, "Subtotal:")
        p.drawString(500, y, f"${estimate.subtotal}")
        y -= 20
        p.drawString(380, y, "IVA (19%):")
        p.drawString(500, y, f"${estimate.tax_amount}")
        y -= 20
        p.drawString(380, y, "Total:")
        p.drawString(500, y, f"${estimate.total_amount}")
        
        p.showPage()
        p.save()
        buffer.seek(0)
        
        from django.http import HttpResponse
        resp = HttpResponse(buffer, content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="Presupuesto_{estimate.id}.pdf"'
        return resp


class SupplierViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Supplier.objects.all().order_by('company_name')
    serializer_class = SupplierSerializer


class SupplierInvoiceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = SupplierInvoice.objects.all().order_by('-emission_date')
    serializer_class = SupplierInvoiceSerializer

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        # We handle creation including possible payment documents
        data = request.data
        supplier_id = data.get('supplier')
        if not supplier_id:
            # Maybe we received supplier RUT? We find or create supplier!
            supplier_rut = data.get('supplier_rut')
            supplier_name = data.get('supplier_name', 'Nuevo Proveedor')
            if supplier_rut:
                supplier, _ = Supplier.objects.get_or_create(
                    rut=supplier_rut,
                    defaults={'company_name': supplier_name}
                )
                data['supplier'] = supplier.id
            else:
                return Response({'error': 'Proveedor requerido.'}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        invoice = serializer.save()

        # Handle split payments / documents
        payment_docs_data = data.get('payment_documents', [])
        for doc_data in payment_docs_data:
            SupplierPaymentDocument.objects.create(
                invoice=invoice,
                document_type=doc_data.get('document_type', 'CHECK'),
                document_number=doc_data.get('document_number', ''),
                amount=Decimal(str(doc_data.get('amount'))),
                payment_date=doc_data.get('payment_date'),
                bank=doc_data.get('bank', ''),
                status=doc_data.get('status', 'PENDING')
            )
        
        # update status if paid
        invoice_status = data.get('status')
        if invoice_status:
            invoice.status = invoice_status
            invoice.save(update_fields=['status'])

        return Response(SupplierInvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


class SupplierPaymentDocumentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = SupplierPaymentDocument.objects.all().order_by('payment_date')
    serializer_class = SupplierPaymentDocumentSerializer


class CashMovementViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = CashMovement.objects.all().order_by('-date')
    serializer_class = CashMovementSerializer

    def perform_create(self, serializer):
        # Auto-associate current active session if not explicitly provided
        current_session = CashRegisterSession.objects.filter(status='OPEN').first()
        serializer.save(
            registered_by=self.request.user,
            session=serializer.validated_data.get('session') or current_session
        )


class SupplierInvoiceParseUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'No se cargó ningún archivo.'}, status=status.HTTP_400_BAD_REQUEST)

        filename = file_obj.name.lower()
        
        # Initialize default values
        parsed_data = {
            'supplier_rut': '',
            'supplier_company_name': '',
            'invoice_number': '',
            'emission_date': '',
            'due_date': '',
            'subtotal': 0,
            'tax_amount': 0,
            'total_amount': 0,
        }

        try:
            if filename.endswith('.xml'):
                # Handle XML DTE (Chile)
                try:
                    tree = ET.parse(file_obj)
                    root = tree.getroot()
                except Exception:
                    file_obj.seek(0)
                    xml_str = file_obj.read().decode('utf-8', errors='ignore')
                    root = ET.fromstring(xml_str)

                # Strip namespaces helper
                def get_tag(elem):
                    return elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

                for elem in root.iter():
                    tag = get_tag(elem)
                    if tag == 'RUTEmit':
                        parsed_data['supplier_rut'] = elem.text.strip()
                    elif tag == 'RznSoc':
                        parsed_data['supplier_company_name'] = elem.text.strip()
                    elif tag == 'Folio':
                        parsed_data['invoice_number'] = elem.text.strip()
                    elif tag == 'FchEmis':
                        parsed_data['emission_date'] = elem.text.strip()
                    elif tag == 'FchVenc':
                        parsed_data['due_date'] = elem.text.strip()
                    elif tag == 'MntNeto':
                        parsed_data['subtotal'] = int(float(elem.text.strip()))
                    elif tag == 'IVA':
                        parsed_data['tax_amount'] = int(float(elem.text.strip()))
                    elif tag == 'MntTotal':
                        parsed_data['total_amount'] = int(float(elem.text.strip()))
                
                # Default due_date to emission_date if missing
                if not parsed_data['due_date']:
                    parsed_data['due_date'] = parsed_data['emission_date']

                return Response(parsed_data, status=status.HTTP_200_OK)

            elif filename.endswith('.pdf') or 'image' in file_obj.content_type:
                # Handle PDF or image using OpenAI and pypdf
                openai_key = os.environ.get('OPENAI_API_KEY')
                if not openai_key:
                    return Response({
                        'error': 'API de OpenAI no configurada en las variables de entorno.',
                        'manual_fallback': True
                    }, status=status.HTTP_400_BAD_REQUEST)

                # Prompt definition
                system_prompt = (
                    "Extrae los datos de esta factura de proveedor chilena. "
                    "Devuelve tu respuesta únicamente como un objeto JSON plano estructurado con "
                    "los siguientes campos exactos y ningún otro texto de adorno:\n"
                    "{\n"
                    "  \"supplier_rut\": \"RUT del proveedor\",\n"
                    "  \"supplier_company_name\": \"Nombre/Razón social del proveedor\",\n"
                    "  \"invoice_number\": \"Número o Folio de la factura\",\n"
                    "  \"emission_date\": \"YYYY-MM-DD\",\n"
                    "  \"due_date\": \"YYYY-MM-DD\",\n"
                    "  \"subtotal\": número neto,\n"
                    "  \"tax_amount\": número IVA,\n"
                    "  \"total_amount\": número total\n"
                    "}"
                )

                client = OpenAI(api_key=openai_key)

                if filename.endswith('.pdf'):
                    # Read using pypdf
                    reader = PdfReader(file_obj)
                    text = ""
                    for page in reader.pages:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                    
                    if len(text.strip()) < 30:
                        return Response({
                            'error': 'El contenido del PDF está vacío o es un escaneo sin texto. Ingrésala manualmente.',
                            'manual_fallback': True
                        }, status=status.HTTP_400_BAD_REQUEST)

                    # Query OpenAI
                    completion = client.chat.completions.create(
                        model="gpt-4o-mini",
                        response_format={"type": "json_object"},
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": f"Contenido del PDF:\n\n{text}"}
                        ]
                    )
                else:
                    # It's an image
                    file_obj.seek(0)
                    encoded_image = base64.b64encode(file_obj.read()).decode('utf-8')
                    completion = client.chat.completions.create(
                        model="gpt-4o-mini",
                        response_format={"type": "json_object"},
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": "Extrae los datos de esta imagen de factura de compra:"},
                                    {
                                        "type": "image_url",
                                        "image_url": {"url": f"data:{file_obj.content_type};base64,{encoded_image}"}
                                    }
                                ]
                            }
                        ]
                    )

                extracted_data = json.loads(completion.choices[0].message.content)
                parsed_data.update(extracted_data)
                return Response(parsed_data, status=status.HTTP_200_OK)

            else:
                return Response({'error': 'Formato no soportado. Cargue un archivo XML (DTE) o PDF digital.'}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({
                'error': f'Error al procesar el archivo: {str(e)}',
                'manual_fallback': True
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SupplierPaymentForecastView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Devuelve el pronóstico de egresos agrupados por día de pago
        para las próximos 45 días, permitiendo encontrar días con baja carga de cobro.
        """
        today = date.today()
        end_date = today + timedelta(days=45)
        
        # Query planned payments in the range
        payments = SupplierPaymentDocument.objects.filter(
            payment_date__gte=today,
            payment_date__lte=end_date,
            status='PENDING'
        ).values('payment_date').annotate(total_amount=Sum('amount')).order_by('payment_date')
        
        # Build dictionary from query
        data_dict = {p['payment_date'].isoformat(): float(p['total_amount']) for p in payments}
        
        # Complete full array of dates
        result = []
        curr = today
        while curr <= end_date:
            curr_str = curr.isoformat()
            result.append({
                'date': curr_str,
                'total_amount': data_dict.get(curr_str, 0.0),
                'day_of_week': curr.strftime('%A')
            })
            curr += timedelta(days=1)
            
        return Response(result, status=status.HTTP_200_OK)


class SupplierPaymentAlertsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Retorna los documentos de pago pendientes que vencen en exactamente
        o menos de 2 días.
        """
        today = timezone.localdate()
        warning_limit = today + timedelta(days=2)
        
        alerts = SupplierPaymentDocument.objects.filter(
            payment_date__gte=today,
            payment_date__lte=warning_limit,
            status='PENDING'
        ).order_by('payment_date')
        
        results = []
        for doc in alerts:
            results.append({
                'id': doc.id,
                'supplier_name': doc.invoice.supplier.company_name,
                'invoice_number': doc.invoice.invoice_number,
                'amount': float(doc.amount),
                'document_type': doc.document_type,
                'payment_date': doc.payment_date.isoformat(),
                'days_remaining': (doc.payment_date - today).days
            })
            
        return Response(results, status=status.HTTP_200_OK)

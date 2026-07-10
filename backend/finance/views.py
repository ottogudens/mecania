from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from django.utils import timezone
from operations.models import WorkOrder, WorkshopSettings

def draw_pdf_header_and_footer(canvas_obj, settings, title, doc_num, date_str, page_num=1):
    from reportlab.lib import colors
    import base64
    import io
    from reportlab.lib.utils import ImageReader

    W, H = 612, 792 # letter size

    # Top Teal colored band
    canvas_obj.setFillColor(colors.HexColor('#ef4444'))
    canvas_obj.rect(0, H - 8, W, 8, fill=1, stroke=0)

    # Render logo if available
    logo_drawn = False
    if settings.logo:
        try:
            logo_str = settings.logo.strip()
            # Handle Data URL format
            if logo_str.startswith('data:image'):
                if ';base64,' in logo_str:
                    header, data = logo_str.split(';base64,', 1)
                    decoded = base64.b64decode(data)
                    img = ImageReader(io.BytesIO(decoded))
                    canvas_obj.drawImage(img, 45, H - 75, width=60, height=60, preserveAspectRatio=True, mask='auto')
                    logo_drawn = True
            else:
                # Handle raw base64 (fallback)
                decoded = base64.b64decode(logo_str)
                img = ImageReader(io.BytesIO(decoded))
                canvas_obj.drawImage(img, 45, H - 75, width=60, height=60, preserveAspectRatio=True, mask='auto')
                logo_drawn = True
        except Exception as e:
            print("Logo parsing in PDF failed:", e)

    # Draw Workshop Information
    text_x = 115 if logo_drawn else 45
    canvas_obj.setFillColor(colors.HexColor('#0f172a')) # Dark Slate
    canvas_obj.setFont("Helvetica-Bold", 16)
    canvas_obj.drawString(text_x, H - 42, settings.name)

    canvas_obj.setFont("Helvetica", 9)
    canvas_obj.setFillColor(colors.HexColor('#475569')) # Muted Slate
    contact_parts = []
    if settings.phone: contact_parts.append(f"Teléfono: {settings.phone}")
    if settings.email: contact_parts.append(f"Email: {settings.email}")
    canvas_obj.drawString(text_x, H - 56, " | ".join(contact_parts))
    if settings.address:
        canvas_obj.drawString(text_x, H - 70, settings.address)

    # Draw Document Title & Date (Right aligned)
    canvas_obj.setFillColor(colors.HexColor('#ef4444')) # Accent Teal
    canvas_obj.setFont("Helvetica-Bold", 13)
    canvas_obj.drawRightString(W - 45, H - 35, title.upper())

    canvas_obj.setFillColor(colors.HexColor('#0f172a'))
    canvas_obj.setFont("Helvetica-Bold", 12)
    canvas_obj.drawRightString(W - 45, H - 50, doc_num)

    canvas_obj.setFont("Helvetica", 9)
    canvas_obj.setFillColor(colors.HexColor('#475569'))
    canvas_obj.drawRightString(W - 45, H - 65, date_str)

    # Draw decorative header/content divider bar
    canvas_obj.setStrokeColor(colors.HexColor('#cbd5e1'))
    canvas_obj.setLineWidth(1)
    canvas_obj.line(45, H - 85, W - 45, H - 85)

    # Standard Footer
    canvas_obj.setFillColor(colors.HexColor('#64748b'))
    canvas_obj.setStrokeColor(colors.HexColor('#cbd5e1'))
    canvas_obj.setLineWidth(0.5)
    canvas_obj.line(45, 45, W - 45, 45)
    canvas_obj.drawString(45, 32, f"Documento de confianza generado por {settings.name} — MecanIA")
    canvas_obj.drawRightString(W - 45, 32, f"Pág. {page_num}")
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

        # Generar notificación de Reporte Z a WhatsApp del Administrador
        try:
            from operations.models import WorkshopSettings
            import os
            import requests

            ws_settings = WorkshopSettings.objects.first()
            if ws_settings and ws_settings.admin_whatsapp:
                phone = ws_settings.admin_whatsapp
                stats = self.get_session_stats(session)
                
                # Calcular diferencias
                diff_cash = session.closing_cash - Decimal(str(stats['expected_cash_drawer']))
                diff_card = session.closing_card - Decimal(str(stats['expected_card']))
                diff_transfer = session.closing_transfer - Decimal(str(stats['expected_transfer']))
                
                def fmt(val):
                    # Formato chileno simple: separador de miles con coma o punto, sin decimales
                    return f"${val:,.0f}".replace(",", ".") if val >= 0 else f"-${abs(val):,.0f}".replace(",", ".")

                message = (
                    f"⭐ *REPORTE Z - CIERRE DE CAJA* ⭐\n\n"
                    f"📅 *Fecha cierre:* {session.closed_at.strftime('%d-%m-%Y %H:%M')}\n"
                    f"👤 *Cerrado por:* {request.user.first_name or request.user.username}\n\n"
                    f"💵 *Monto Inicial:* {fmt(session.opening_amount)}\n\n"
                    f"📊 *Resumen Efectivo (Caja):*\n"
                    f"  - Esperado en caja: {fmt(Decimal(str(stats['expected_cash_drawer'])))}\n"
                    f"  - Físico declarado: {fmt(session.closing_cash)}\n"
                    f"  - Diferencia: {fmt(diff_cash)}\n\n"
                    f"💳 *Resumen Transbank (Tarjeta):*\n"
                    f"  - Esperado tarjeta: {fmt(Decimal(str(stats['expected_card'])))}\n"
                    f"  - Físico declarado: {fmt(session.closing_card)}\n"
                    f"  - Diferencia: {fmt(diff_card)}\n\n"
                    f"🏦 *Resumen Transferencias:*\n"
                    f"  - Esperado transf: {fmt(Decimal(str(stats['expected_transfer'])))}\n"
                    f"  - Físico declarado: {fmt(session.closing_transfer)}\n"
                    f"  - Diferencia: {fmt(diff_transfer)}\n\n"
                    f"📝 *Notas de Cierre:* {session.closing_notes or 'Sin comentarios.'}"
                )

                from operations.services import send_whatsapp_message
                send_whatsapp_message(number=phone, text=message)
        except Exception as e:
            # Capturar errores de red/configuración sin romper la respuesta del cierre de caja
            import logging
            logging.getLogger(__name__).error(f"Error al enviar Reporte Z por WhatsApp: {str(e)}")

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

        settings = WorkshopSettings.load()

        # Header using unified template
        draw_pdf_header_and_footer(p, settings, "Boleta / Factura", f"BOLETA #{invoice.id}", invoice.created_at.strftime("%d/%m/%Y %H:%M"), 1)

        # Client and Vehicle Box
        p.setFillColor(colors.HexColor('#f8fafc'))
        p.setStrokeColor(colors.HexColor('#e2e8f0'))
        p.roundRect(45, 595, 522, 75, 4, fill=True, stroke=True)
        
        p.setFillColor(colors.HexColor('#0f172a'))
        p.setFont("Helvetica-Bold", 10)
        p.drawString(55, 652, "DURANTE LA TRANSACCIÓN")
        p.drawString(305, 652, "CLIENTE / FACTURACIÓN")
        
        p.setFont("Helvetica", 9)
        p.setFillColor(colors.HexColor('#334155'))
        
        origen = f"Orden de Trabajo #{invoice.work_order_id}" if invoice.work_order_id else "Venta de Mostrador"
        p.drawString(55, 636, f"Origen: {origen}")
        if invoice.work_order_id and invoice.work_order.vehicle:
            plate = invoice.work_order.vehicle.license_plate
            p.drawString(55, 622, f"Patente Vehículo: {plate}")
        else:
            p.drawString(55, 622, "N/A")
        p.drawString(55, 608, f"Fecha de Emisión: {invoice.created_at.strftime('%d/%m/%Y')}")
        
        client_name = "–"
        c = None
        if invoice.client_id:
            c = invoice.client
            client_name = f"{c.first_name} {c.last_name}"
        elif invoice.work_order_id and invoice.work_order.vehicle.client_id:
            c = invoice.work_order.vehicle.client
            client_name = f"{c.first_name} {c.last_name}"
            
        p.drawString(305, 636, f"Nombre: {client_name}")
        p.drawString(305, 622, f"Teléfono: {c.phone if c else 'No registrado'}")
        p.drawString(305, 608, f"Email: {c.email if c else 'No registrado'}")

        # Table Header
        y = 560
        p.setFillColor(colors.HexColor('#1e293b'))
        p.rect(45, y - 6, 522, 20, fill=True, stroke=False)
        p.setFillColor(colors.white)
        p.setFont("Helvetica-Bold", 9)
        p.drawString(55, y, "Descripción")
        p.drawString(320, y, "Cant.")
        p.drawRightString(460, y, "Precio Unitario")
        p.drawRightString(550, y, "Total")

        # Items
        items = list(invoice.get_line_items())
        y -= 22
        p.setFont("Helvetica", 9)
        idx = 0
        for item in items:
            # Alternating background colors for rows
            if idx % 2 == 0:
                p.setFillColor(colors.HexColor('#f8fafc'))
            else:
                p.setFillColor(colors.white)
            p.rect(45, y - 4, 522, 18, fill=True, stroke=False)
            
            p.setFillColor(colors.HexColor('#1e293b'))
            desc = getattr(item, 'description', '') or ''
            if not desc:
                desc = getattr(item, 'description', str(item))
            p.drawString(55, y, str(desc)[:45])
            qty = item.quantity if hasattr(item, 'quantity') else 1
            up = item.unit_price
            tot = item.total_price
            p.drawString(320, y, f"{qty}")
            p.drawRightString(460, y, f"${int(up):,}")
            p.drawRightString(550, y, f"${int(tot):,}")
            y -= 20
            idx += 1

        # Totals Section
        y -= 10
        p.setStrokeColor(colors.HexColor('#cbd5e1'))
        p.setLineWidth(1)
        p.line(45, y, 567, y)

        totals = [
            ("Subtotal", invoice.subtotal),
            ("IVA (19%)", invoice.tax_amount),
            ("TOTAL", invoice.total_amount)
        ]
        
        y -= 15
        for label, val in totals:
            if label == "TOTAL":
                p.setFont("Helvetica-Bold", 12)
                p.setFillColor(colors.HexColor('#0f172a'))
                p.drawRightString(460, y, label)
                p.setFillColor(colors.HexColor('#ef4444'))
                p.drawRightString(550, y, f"${int(val):,}")
            else:
                p.setFont("Helvetica", 10)
                p.setFillColor(colors.HexColor('#475569'))
                p.drawRightString(460, y, label)
                p.setFillColor(colors.HexColor('#1e293b'))
                p.drawRightString(550, y, f"${int(val):,}")
            y -= 18

        # --- payment badge ---
        if invoice.status == 'PAID':
            y -= 15
            p.setFillColor(colors.HexColor('#10b981'))
            p.roundRect(W - 160, y - 4, 115, 22, 4, fill=1, stroke=0)
            p.setFillColor(colors.white)
            p.setFont("Helvetica-Bold", 10)
            p.drawCentredString(W - 102, y + 3, "✓ PAGADO")
        elif invoice.status == 'PARTIALLY_PAID':
            y -= 15
            p.setFillColor(colors.HexColor('#f59e0b'))
            p.roundRect(W - 175, y - 4, 130, 22, 4, fill=1, stroke=0)
            p.setFillColor(colors.white)
            p.setFont("Helvetica-Bold", 9)
            p.drawCentredString(W - 110, y + 3, f"ABONO: ${int(invoice.amount_paid):,}")

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

    def _generate_pdf_content(self, estimate):
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors

        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        W, H = letter

        from operations.models import WorkshopSettings
        settings = WorkshopSettings.load()
        
        # Header using unified template
        draw_pdf_header_and_footer(p, settings, "Presupuesto", f"PRE-#{estimate.id}", estimate.created_at.strftime("%d/%m/%Y"), 1)
        
        # Client and Vehicle Box
        p.setFillColor(colors.HexColor('#f8fafc'))
        p.setStrokeColor(colors.HexColor('#e2e8f0'))
        p.roundRect(45, 595, 522, 75, 4, fill=True, stroke=True)
        
        p.setFillColor(colors.HexColor('#0f172a'))
        p.setFont("Helvetica-Bold", 10)
        p.drawString(55, 652, "INFORMACIÓN DEL CLIENTE")
        p.drawString(305, 652, "INFORMACIÓN DE LA COTIZACIÓN")
        
        p.setFont("Helvetica", 9)
        p.setFillColor(colors.HexColor('#334155'))
        client_name = f"{estimate.client.first_name} {estimate.client.last_name}" if estimate.client else "Desconocido"
        client_phone = estimate.client.phone if estimate.client else "No registrado"
        p.drawString(55, 636, f"Nombre: {client_name}")
        p.drawString(55, 622, f"Teléfono: {client_phone}")
        p.drawString(55, 608, f"Email: {estimate.client.email if estimate.client else 'No registrado'}")
        
        vehicle_info = "Venta Mostrador / Sin Vehículo"
        if estimate.vehicle:
            vehicle_info = f"{estimate.vehicle.make} {estimate.vehicle.model} (Placa: {estimate.vehicle.license_plate})"
        p.drawString(305, 636, f"Vehículo: {vehicle_info}")
        p.drawString(305, 622, f"Fecha de Emisión: {estimate.created_at.strftime('%d/%m/%Y %H:%M')}")
        p.drawString(305, 608, f"Estado / Tipo: {estimate.get_status_display()}")
        
        # Table Header
        y = 560
        p.setFillColor(colors.HexColor('#1e293b'))
        p.rect(45, y - 6, 522, 20, fill=True, stroke=False)
        p.setFillColor(colors.white)
        p.setFont("Helvetica-Bold", 9)
        p.drawString(55, y, "Descripción")
        p.drawString(320, y, "Cant.")
        p.drawRightString(460, y, "Precio Unit.")
        p.drawRightString(550, y, "Total")
        
        # Items
        y -= 22
        p.setFont("Helvetica", 9)
        idx = 0
        for item in estimate.items.all():
            # Alternating background colors for rows
            if idx % 2 == 0:
                p.setFillColor(colors.HexColor('#f8fafc'))
            else:
                p.setFillColor(colors.white)
            p.rect(45, y - 4, 522, 18, fill=True, stroke=False)
            
            p.setFillColor(colors.HexColor('#1e293b'))
            p.drawString(55, y, str(item.description)[:45])
            p.drawString(320, y, f"{item.quantity}")
            p.drawRightString(460, y, f"${item.unit_price:,.0f}")
            p.drawRightString(550, y, f"${item.total_price:,.0f}")
            y -= 20
            idx += 1
            
        # Totals Section
        y -= 10
        p.setStrokeColor(colors.HexColor('#cbd5e1'))
        p.setLineWidth(1)
        p.line(45, y, 567, y)
        
        totals = [
            ("Subtotal:", estimate.subtotal),
            ("IVA (19%):", estimate.tax_amount),
            ("Monto Total:", estimate.total_amount)
        ]
        
        y -= 15
        for label, val in totals:
            if label == "Monto Total:":
                p.setFont("Helvetica-Bold", 12)
                p.setFillColor(colors.HexColor('#0f172a'))
                p.drawRightString(460, y, label)
                p.setFillColor(colors.HexColor('#ef4444'))
                p.drawRightString(550, y, f"${val:,.0f}")
            else:
                p.setFont("Helvetica", 10)
                p.setFillColor(colors.HexColor('#475569'))
                p.drawRightString(460, y, label)
                p.setFillColor(colors.HexColor('#1e293b'))
                p.drawRightString(550, y, f"${val:,.0f}")
            y -= 18
        
        p.showPage()
        p.save()
        buffer.seek(0)
        return buffer.getvalue()

    @action(detail=True, methods=['post'])
    def share_whatsapp(self, request, pk=None):
        estimate = self.get_object()
        if not estimate.client.phone:
            return Response({'error': 'Client has no phone number'}, status=status.HTTP_400_BAD_REQUEST)
        
        text = f"¡Hola {estimate.client.first_name}! Te compartimos el presupuesto PRE-{estimate.id} por un total de ${estimate.total_amount}. Puedes revisarlo en el documento adjunto."
        
        # Generar contenido binario del PDF y codificarlo en Base64
        import base64
        pdf_data = self._generate_pdf_content(estimate)
        pdf_base64 = base64.b64encode(pdf_data).decode('utf-8')
        
        from operations.services import send_whatsapp_message
        success = send_whatsapp_message(
            number=estimate.client.phone,
            text=text,
            document_base64=pdf_base64,
            file_name=f"Presupuesto_{estimate.id}.pdf"
        )
        if success:
            estimate.status = 'SENT'
            estimate.save(update_fields=['status'])
            return Response({'success': True})
        else:
            return Response({'error': 'Failed to send via WhatsApp or microservice not available'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        estimate = self.get_object()
        pdf_data = self._generate_pdf_content(estimate)
        
        from django.http import HttpResponse
        resp = HttpResponse(pdf_data, content_type='application/pdf')
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
        
        # Query planned payments in the range with related models for supplier details
        payments = SupplierPaymentDocument.objects.filter(
            payment_date__gte=today,
            payment_date__lte=end_date,
            status='PENDING'
        ).select_related('invoice', 'invoice__supplier').order_by('payment_date')
        
        # Group documents by payment date
        grouped_docs = {}
        for p in payments:
            d_str = p.payment_date.isoformat()
            if d_str not in grouped_docs:
                grouped_docs[d_str] = []
            
            supplier_name = "Proveedor"
            if p.invoice and p.invoice.supplier:
                supplier_name = p.invoice.supplier.company_name or "Proveedor"
                
            grouped_docs[d_str].append({
                'id': p.id,
                'supplier_name': supplier_name,
                'document_type': p.document_type,
                'document_number': p.document_number,
                'amount': float(p.amount)
            })
        
        # Build results list for only dates containing active payments
        result = []
        curr = today
        while curr <= end_date:
            curr_str = curr.isoformat()
            docs_list = grouped_docs.get(curr_str, [])
            if docs_list:
                total_amt = sum(d['amount'] for d in docs_list)
                result.append({
                    'payment_date': curr_str,
                    'total_amount': total_amt,
                    'day_of_week': curr.strftime('%A'),
                    'documents': docs_list
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

class FinanceResetView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .models import Invoice, InvoiceLineItem, Payment, CashRegisterSession, SupplierInvoice, SupplierPaymentDocument, CashMovement, Estimate, EstimateLineItem
        
        InvoiceLineItem.objects.all().delete()
        Payment.objects.all().delete()
        CashMovement.objects.all().delete()
        CashRegisterSession.objects.all().delete()
        SupplierPaymentDocument.objects.all().delete()
        SupplierInvoice.objects.all().delete()
        EstimateLineItem.objects.all().delete()
        Estimate.objects.all().delete()
        Invoice.objects.all().delete()
        
        return Response({'success': True, 'message': 'Todos los movimientos financieros han sido reiniciados a cero.'})

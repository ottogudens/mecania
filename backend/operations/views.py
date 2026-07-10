from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from django.contrib.auth import authenticate
from django.http import HttpResponse
import io
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from rest_framework.authtoken.models import Token
import requests
import os
from openai import OpenAI
from .models import Client, Vehicle, WorkOrder, WorkOrderItem, VisualInspection, WorkshopSettings, VehiclePart, MaintenanceRecord, ScheduledMaintenance, UserProfile, WhatsAppFlow, WhatsAppMessage, WorkOrderAttachment
from .serializers import (
    ClientSerializer, VehicleSerializer, WorkOrderSerializer,
    WorkOrderItemSerializer, VisualInspectionSerializer, VisualInspectionListSerializer, WorkshopSettingsSerializer,
    VehiclePartSerializer, MaintenanceRecordSerializer, ScheduledMaintenanceSerializer,
    WhatsAppFlowSerializer, WhatsAppMessageSerializer, WorkOrderAttachmentSerializer
)
from .services import transition_work_order_status, cancel_work_order, WorkOrderTransitionError

def draw_pdf_header_and_footer(canvas_obj, settings, title, doc_num, date_str, page_num=1):
    from reportlab.lib import colors
    import base64
    import io
    from reportlab.lib.utils import ImageReader

    W, H = 612, 792 # letter size

    # Top Teal colored band
    canvas_obj.setFillColor(colors.HexColor('#0d9488'))
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
    canvas_obj.setFillColor(colors.HexColor('#0d9488')) # Accent Teal
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


class ClientViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Client.objects.all().order_by('-id')
    serializer_class = ClientSerializer

    @action(detail=True, methods=['post'])
    def send_credentials(self, request, pk=None):
        """Genera PIN, activa portal y envía credenciales por WhatsApp."""
        client = self.get_object()

        if not client.phone:
            return Response(
                {'error': 'El cliente no tiene teléfono registrado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_pin = Client.generate_pin()
        client.set_pin(raw_pin)
        client.portal_enabled = True
        client.save(update_fields=['pin_hash', 'portal_enabled'])

        # Construir URL del portal de manera segura y pública
        workshop = WorkshopSettings.load()
        frontend_base = os.environ.get('FRONTEND_URL', '').strip() or 'https://mecania.skale.cl'
        portal_url = f"{frontend_base.rstrip('/')}/client"

        workshop_name = workshop.name or 'MecanIA'

        message = (
            f"¡Hola {client.first_name}! 👋\n\n"
            f"Bienvenido al Portal de Clientes de {workshop_name}. "
            f"Ahora puedes consultar la ficha técnica de tu vehículo, "
            f"historial de mantenciones y próximas revisiones en cualquier momento.\n\n"
            f"🔐 Tus credenciales de acceso:\n"
            f"📱 Teléfono: {client.phone}\n"
            f"🔑 PIN: {raw_pin}\n\n"
            f"🌐 Accede e instala la app aquí: {portal_url}\n\n"
            f"¡Gracias por confiar en nosotros!"
        )

        from .services import send_whatsapp_message
        success = send_whatsapp_message(number=client.phone, text=message)
        if success:
            return Response({
                'success': True,
                'message': f'Credenciales enviadas a {client.phone}.',
                'pin': raw_pin,  # Mostrar solo en la respuesta admin
            })
        else:
            return Response({
                'success': True,
                'message': f'Portal activado pero WhatsApp no disponible o falló. PIN generado: {raw_pin}',
                'pin': raw_pin,
                'whatsapp_error': True,
            })

    @action(detail=True, methods=['post'])
    def resend_pin(self, request, pk=None):
        """Regenera PIN y lo reenvía por WhatsApp."""
        client = self.get_object()

        if not client.phone:
            return Response(
                {'error': 'El cliente no tiene teléfono registrado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_pin = Client.generate_pin()
        client.set_pin(raw_pin)
        client.portal_enabled = True
        client.save(update_fields=['pin_hash', 'portal_enabled'])

        workshop = WorkshopSettings.load()
        frontend_base = os.environ.get('FRONTEND_URL', '').strip() or 'https://mecania.skale.cl'
        portal_url = f"{frontend_base.rstrip('/')}/client"

        workshop_name = workshop.name or 'MecanIA'

        message = (
            f"Hola {client.first_name}, aquí tienes tu nuevo PIN de acceso "
            f"al Portal de Clientes de {workshop_name}:\n\n"
            f"🔑 PIN: {raw_pin}\n\n"
            f"🌐 Accede e instala la app aquí: {portal_url}\n\n"
            f"Si no solicitaste este cambio, contáctanos."
        )

        from .services import send_whatsapp_message
        success = send_whatsapp_message(number=client.phone, text=message)
        if success:
            return Response({
                'success': True,
                'message': f'Nuevo PIN enviado a {client.phone}.',
                'pin': raw_pin,
            })
        else:
            return Response({
                'success': True,
                'message': f'PIN regenerado pero WhatsApp no disponible o falló. PIN: {raw_pin}',
                'pin': raw_pin,
                'whatsapp_error': True,
            })

class VehicleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Vehicle.objects.all().order_by('-id')
    serializer_class = VehicleSerializer

    @action(detail=True, methods=['get'])
    def full_record(self, request, pk=None):
        """Devuelve la ficha completa del vehículo: datos + partes + mantenciones + programadas."""
        vehicle = self.get_object()
        parts = VehiclePart.objects.filter(vehicle=vehicle)
        maintenance_records = MaintenanceRecord.objects.filter(vehicle=vehicle)
        scheduled = ScheduledMaintenance.objects.filter(vehicle=vehicle)
        work_orders = WorkOrder.objects.filter(vehicle=vehicle).order_by('-created_at')

        return Response({
            'vehicle': VehicleSerializer(vehicle).data,
            'parts': VehiclePartSerializer(parts, many=True).data,
            'maintenance_records': MaintenanceRecordSerializer(maintenance_records, many=True).data,
            'scheduled_maintenance': ScheduledMaintenanceSerializer(scheduled, many=True).data,
            'work_orders': WorkOrderSerializer(work_orders, many=True).data,
        })

class WorkOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = WorkOrder.objects.all().order_by('-created_at')
    serializer_class = WorkOrderSerializer

    def update(self, request, *args, **kwargs):
        """
        Bloquea el cambio directo de 'status' vía PUT/PATCH genérico. Todo
        cambio de estado debe pasar por la acción change_status, que aplica
        la validación de evidencia obligatoria y el descuento de inventario.
        Otros campos (kilometraje, mecánico asignado, etc.) sí se pueden
        editar normalmente por esta vía.
        """
        if 'status' in request.data:
            return Response(
                {
                    'error': "No se puede cambiar 'status' directamente. "
                             "Usa POST /api/operations/work-orders/{id}/change_status/ "
                             "con {'status': '<nuevo_estado>'}."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def change_status(self, request, pk=None):
        """
        Único endpoint autorizado para avanzar/cambiar el estado de una OT.
        Aplica la regla de evidencia obligatoria en hallazgos críticos y,
        al completar/entregar, descuenta inventario en una transacción
        atómica (ver operations/services.py).
        """
        work_order = self.get_object()
        new_status = request.data.get('status')
        if not new_status:
            return Response({'error': "Debes indicar 'status'."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            transition_work_order_status(work_order=work_order, new_status=new_status, user=request.user)
        except WorkOrderTransitionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(WorkOrderSerializer(work_order).data)

    @action(detail=True, methods=['post'])
    def take_order(self, request, pk=None):
        work_order = self.get_object()
        if work_order.status != 'PENDING':
            return Response({'error': 'La orden de trabajo ya no está pendiente.'}, status=status.HTTP_400_BAD_REQUEST)
        
        work_order.mechanic = request.user
        work_order.status = 'IN_PROGRESS'
        work_order.save()
        return Response(WorkOrderSerializer(work_order).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancela la OT (no aplica si ya fue entregada al cliente)."""
        work_order = self.get_object()
        reason = request.data.get('reason', '')
        try:
            cancel_work_order(work_order=work_order, reason=reason)
        except WorkOrderTransitionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(WorkOrderSerializer(work_order).data)

    @action(detail=True, methods=['post'])
    def notify_client(self, request, pk=None):
        work_order = self.get_object()
        client = work_order.vehicle.client
        
        if not client or not client.phone:
            return Response({'error': 'El vehículo no tiene un cliente asignado con teléfono válido.'}, status=status.HTTP_400_BAD_REQUEST)
        
        message = request.data.get('message', f"Hola {client.first_name}, tu vehículo {work_order.vehicle.license_plate} tiene una actualización. Estado: {work_order.get_status_display()}")
        
        from .services import send_whatsapp_message
        success = send_whatsapp_message(number=client.phone, text=message)
        if success:
            return Response({'success': True, 'message': 'Notificación enviada vía WhatsApp.'})
        else:
            return Response({'error': 'Fallo al enviar notificación al microservicio o WhatsApp no disponible.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def send_findings_whatsapp(self, request, pk=None):
        work_order = self.get_object()
        client = work_order.vehicle.client
        
        if not client or not client.phone:
            return Response({'error': 'El vehículo no tiene un cliente asignado con teléfono válido.'}, status=status.HTTP_400_BAD_REQUEST)
        
        findings = work_order.additional_findings
        if not findings:
            return Response({'error': 'No hay hallazgos adicionales registrados en esta OT.'}, status=status.HTTP_400_BAD_REQUEST)
            
        message = (
            f"Hola {client.first_name}, durante la revisión de tu vehículo {work_order.vehicle.make} {work_order.vehicle.model} "
            f"(Placa: {work_order.vehicle.license_plate}), nuestro mecánico ha identificado el siguiente detalle/problema:\n\n"
            f"\"{findings}\"\n\n"
            f"Por favor, indícanos si apruebas realizar este servicio adicional respondiendo a este mensaje."
        )
        
        from .services import send_whatsapp_message
        success = send_whatsapp_message(number=client.phone, text=message)
        if success:
            return Response({'success': True, 'message': 'Mensaje de hallazgos enviado vía WhatsApp.'})
        else:
            return Response({'error': 'Fallo al enviar notificación al microservicio o WhatsApp no disponible.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def generate_pdf(self, request, pk=None):
        work_order = self.get_object()
        client = work_order.vehicle.client
        vehicle = work_order.vehicle
        items = WorkOrderItem.objects.filter(work_order=work_order)

        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        W, H = letter

        from operations.models import WorkshopSettings
        settings = WorkshopSettings.load()
        
        # Header using unified template
        draw_pdf_header_and_footer(p, settings, "Orden de Trabajo", f"OT #{work_order.id}", f"Fecha: {work_order.created_at.strftime('%d/%m/%Y') if work_order.created_at else ''}", 1)
        
        # Client and Vehicle Box
        p.setFillColor(colors.HexColor('#f8fafc'))
        p.setStrokeColor(colors.HexColor('#e2e8f0'))
        p.roundRect(45, 595, 522, 75, 4, fill=True, stroke=True)
        
        p.setFillColor(colors.HexColor('#0f172a'))
        p.setFont("Helvetica-Bold", 10)
        p.drawString(55, 652, "INFORMACIÓN DEL CLIENTE")
        p.drawString(305, 652, "INFORMACIÓN DEL VEHÍCULO")
        
        p.setFont("Helvetica", 9)
        p.setFillColor(colors.HexColor('#334155'))
        client_name = f"{client.first_name} {client.last_name}" if client else "Desconocido"
        client_phone = client.phone if client else "No registrado"
        client_email = client.email if client else "No registrado"
        p.drawString(55, 636, f"Nombre: {client_name}")
        p.drawString(55, 622, f"Teléfono: {client_phone}")
        p.drawString(55, 608, f"Email: {client_email}")
        
        p.drawString(305, 636, f"Placa Patente: {vehicle.license_plate}")
        p.drawString(305, 622, f"Marca / Modelo: {vehicle.make} {vehicle.model}")
        p.drawString(305, 608, f"Año / Estado: {vehicle.year} - {work_order.get_status_display()}")
        
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
        y -= 22
        p.setFont("Helvetica", 9)
        total_amount = 0
        idx = 0
        for item in items:
            item_total = item.quantity * item.unit_price
            total_amount += item_total
            
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
            p.drawRightString(550, y, f"${item_total:,.0f}")
            y -= 20
            idx += 1
        
        # Totals Section
        y -= 10
        p.setStrokeColor(colors.HexColor('#cbd5e1'))
        p.setLineWidth(1)
        p.line(45, y, 567, y)
        y -= 22
        p.setFont("Helvetica-Bold", 12)
        p.setFillColor(colors.HexColor('#0f172a'))
        p.drawRightString(460, y, "Monto Total:")
        p.setFillColor(colors.HexColor('#0d9488'))
        p.drawRightString(550, y, f"${total_amount:,.0f}")
        
        # Bottom text
        y -= 45
        p.setFillColor(colors.HexColor('#475569'))
        p.setFont("Helvetica-Bold", 9)
        p.drawString(45, y, "** Gracias por confiar en nuestro servicio técnico **")
        
        p.showPage()
        p.save()
        
        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="OT_{work_order.id}.pdf"'
        return response

class WorkOrderItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = WorkOrderItem.objects.all().order_by('id')
    serializer_class = WorkOrderItemSerializer

class WorkOrderAttachmentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)
    queryset = WorkOrderAttachment.objects.all().order_by('-uploaded_at')
    serializer_class = WorkOrderAttachmentSerializer

class VisualInspectionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = VisualInspection.objects.all().order_by('-created_at')
    serializer_class = VisualInspectionSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return VisualInspectionListSerializer
        return VisualInspectionSerializer

    @action(detail=True, methods=['post'])
    def take_inspection(self, request, pk=None):
        inspection = self.get_object()
        if inspection.status != 'PENDING':
            return Response({'error': 'La inspección ya no está pendiente.'}, status=status.HTTP_400_BAD_REQUEST)
        inspection.mechanic = request.user
        inspection.status = 'IN_PROGRESS'
        inspection.save()
        return Response(VisualInspectionSerializer(inspection).data)

    @action(detail=True, methods=['post'])
    def complete_inspection(self, request, pk=None):
        inspection = self.get_object()
        inspection.status = 'COMPLETED'
        inspection.save()
        return Response(VisualInspectionSerializer(inspection).data)

    @action(detail=True, methods=['get'])
    def generate_pdf(self, request, pk=None):
        import textwrap
        import base64
        from reportlab.lib.utils import ImageReader

        inspection = self.get_object()
        vehicle = inspection.vehicle
        client = vehicle.client if vehicle else None
        
        # Load workshop settings
        settings = WorkshopSettings.load()
        
        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        W, H = letter
        
        # Draw Header/Footer Helper
        def draw_header_footer(c, page_num):
            draw_pdf_header_and_footer(c, settings, "Informe de Inspección", f"INS-{inspection.id}", f"Fecha: {inspection.created_at.strftime('%d/%m/%Y') if inspection.created_at else ''}", page_num)
            
        page_num = 1
        draw_header_footer(p, page_num)
        
        # Title
        p.setFont("Helvetica-Bold", 12)
        p.setFillColor(colors.HexColor('#0f172a'))
        p.drawString(50, 680, "INFORME DE INSPECCIÓN VISUAL VEHICULAR")
        
        status_label = "Pendiente"
        if inspection.status == 'IN_PROGRESS':
            status_label = "En Proceso"
        elif inspection.status == 'COMPLETED':
            status_label = "Completada"
            
        p.setFont("Helvetica", 9)
        p.setFillColor(colors.HexColor('#334155'))
        p.drawRightString(562, 690, f"Fecha: {inspection.created_at.strftime('%d/%m/%Y')}")
        p.drawRightString(562, 680, f"Estado: {status_label}")
        
        # Client & Vehicle Box
        p.setFillColor(colors.HexColor('#f8fafc'))
        p.setStrokeColor(colors.HexColor('#e2e8f0'))
        p.rect(50, 580, 512, 85, fill=True, stroke=True)
        
        p.setFillColor(colors.HexColor('#0f172a'))
        p.setFont("Helvetica-Bold", 10)
        p.drawString(60, 650, "DATOS DEL VEHÍCULO")
        p.drawString(320, 650, "DATOS DE LA INSPECCIÓN")
        
        p.setFont("Helvetica", 9)
        p.setFillColor(colors.HexColor('#334155'))
        plate = vehicle.license_plate if vehicle else "S/P"
        make_model = f"{vehicle.make} {vehicle.model}" if vehicle else "S/D"
        year = str(vehicle.year) if vehicle else "S/D"
        vin = vehicle.vin if (vehicle and vehicle.vin) else "S/D"
        
        p.drawString(60, 634, f"Patente: {plate}")
        p.drawString(60, 620, f"Vehículo: {make_model}")
        p.drawString(60, 606, f"Año: {year}")
        p.drawString(60, 592, f"VIN: {vin}")
        
        mechanic_name = f"{inspection.mechanic.first_name} {inspection.mechanic.last_name}" if (inspection.mechanic and inspection.mechanic.first_name) else (inspection.mechanic.username if inspection.mechanic else "No asignado")
        owner_name = f"{client.first_name} {client.last_name}" if client else "Sin asignar"
        owner_phone = client.phone if client else "S/D"
        
        p.drawString(320, 634, f"Cliente: {owner_name}")
        p.drawString(320, 620, f"Contacto: {owner_phone}")
        p.drawString(320, 606, f"Mecánico: {mechanic_name}")
        p.drawString(320, 592, f"Ficha ID: INS-{inspection.id}")
        
        # General Observations Section
        p.setFont("Helvetica-Bold", 10)
        p.setFillColor(colors.HexColor('#0f172a'))
        p.drawString(50, 548, "Observaciones Generales:")
        p.setFont("Helvetica", 9)
        p.setFillColor(colors.HexColor('#475569'))
        obs_text = inspection.notes or "Sin notas generales."
        wrapped_obs = textwrap.wrap(obs_text, width=100)
        y_obs = 534
        for line in wrapped_obs:
            p.drawString(50, y_obs, line)
            y_obs -= 13
            
        y_pos = y_obs - 10
        # Line separating observations
        p.setStrokeColor(colors.HexColor('#e2e8f0'))
        p.line(50, y_pos+5, 562, y_pos+5)
        
        category_map = {
            'engine': 'Motor (🔧)',
            'brakes': 'Frenos (🛑)',
            'suspension': 'Suspensión (↕️)',
            'tires': 'Neumáticos (🛞)',
            'lights': 'Luces (💡)',
            'bodywork': 'Carrocería (🚗)',
            'interior': 'Interior (💺)',
            'exhaust': 'Escape (💨)'
        }
        
        items_data = inspection.items_json or {}
        
        p.setFont("Helvetica-Bold", 11)
        p.setFillColor(colors.HexColor('#0f172a'))
        p.drawString(50, y_pos - 12, "ESTADO GENERAL DE COMPONENTES:")
        y_pos -= 26
        
        # Iterate over checklist components
        for c_id, c_label in category_map.items():
            comp_data = items_data.get(c_id, {'status': 'OK', 'note': '', 'image': None})
            status = comp_data.get('status', 'OK')
            note = comp_data.get('note', '')
            image_data = comp_data.get('image', None)
            
            wrapped_note = textwrap.wrap(note or "Sin observaciones particulares.", width=80)
            lines_count = len(wrapped_note)
            height_needed = 24 + (lines_count * 13)
            if image_data and image_data.startswith('data:image'):
                height_needed += 110
                
            # Handle page overflow
            if y_pos - height_needed < 60:
                p.showPage()
                page_num += 1
                draw_header_footer(p, page_num)
                y_pos = 675
                
            # Component Background
            p.setFillColor(colors.HexColor('#f1f5f9'))
            p.rect(50, y_pos - 18, 512, 18, fill=True, stroke=False)
            
            p.setFillColor(colors.HexColor('#0f172a'))
            p.setFont("Helvetica-Bold", 9)
            p.drawString(55, y_pos - 13, c_label)
            
            # Status Badge
            st_color = colors.HexColor('#10b981')
            st_text = "Todo OK"
            if status == 'WARNING':
                st_color = colors.HexColor('#f59e0b')
                st_text = "Advertencia"
            elif status == 'CRITICAL':
                st_color = colors.HexColor('#ef4444')
                st_text = "Crítico / Falla"
                
            p.setFillColor(st_color)
            p.rect(460, y_pos - 15, 92, 12, fill=True, stroke=False)
            p.setFillColor(colors.white if status == 'CRITICAL' else colors.black)
            p.setFont("Helvetica-Bold", 8)
            p.drawCentredString(506, y_pos - 12, st_text)
            
            y_pos -= 28
            p.setFont("Helvetica-Bold", 8)
            p.setFillColor(colors.HexColor('#475569'))
            p.drawString(55, y_pos + 12, "Diagnóstico:")
            
            p.setFont("Helvetica", 9)
            p.setFillColor(colors.HexColor('#334155'))
            y_note = y_pos + 12
            for line in wrapped_note:
                p.drawString(140, y_note, line)
                y_note -= 13
                
            y_pos = y_note - 5
            
            # Draw base64 evidence if available
            if image_data and image_data.startswith('data:image'):
                try:
                    header, data = image_data.split(';base64,')
                    decoded = base64.b64decode(data)
                    img = ImageReader(io.BytesIO(decoded))
                    p.setStrokeColor(colors.HexColor('#cbd5e1'))
                    p.rect(140, y_pos - 92, 125, 92, fill=False, stroke=True)
                    p.drawImage(img, 140, y_pos - 92, width=125, height=92, preserveAspectRatio=True, mask='auto')
                    y_pos -= 102
                except Exception as e:
                    print(f"Error drawing evidence image block {c_id}:", e)
                    p.setFont("Helvetica-Oblique", 8)
                    p.setFillColor(colors.HexColor('#94a3b8'))
                    p.drawString(140, y_pos - 10, "[Error al procesar archivo de evidencia]")
                    y_pos -= 18
            else:
                y_pos -= 5
                
            p.setStrokeColor(colors.HexColor('#e2e8f0'))
            p.setLineWidth(0.5)
            p.line(50, y_pos+5, 562, y_pos+5)
            y_pos -= 8
            
        p.showPage()
        p.save()
        
        buffer.seek(0)
        resp = HttpResponse(buffer, content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="Inspeccion_{plate}_{inspection.id}.pdf"'
        return resp

class CustomAuthToken(APIView):
    """Login endpoint — public, no authentication required."""
    permission_classes = []
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        username = request.data.get('username')
        password = request.data.get('password')
        
        user = authenticate(username=username, password=password)
        
        if user is not None:
            token, created = Token.objects.get_or_create(user=user)
            try:
                profile = user.profile
                role = 'admin' if profile.role == 'ADMIN' else 'mechanic'
            except UserProfile.DoesNotExist:
                role = 'admin' if user.is_superuser else 'mechanic'
            
            return Response({
                'token': token.key,
                'role': role,
                'user_id': user.pk,
                'username': user.username
            })
        else:
            return Response({'error': 'Credenciales inválidas'}, status=status.HTTP_401_UNAUTHORIZED)

class WorkshopSettingsView(APIView):
    # Depending on requirements, we might want IsAuthenticated or public access
    # Let's allow authenticated to read/write, or public to read
    # We will just allow any for now for read, and auth for write, or just auth for both
    # The requirement is just to use it for PDFs and show it in settings.
    permission_classes = [IsAuthenticated]

    def get(self, request):
        settings = WorkshopSettings.load()
        serializer = WorkshopSettingsSerializer(settings, context={'request': request})
        return Response(serializer.data)

    def put(self, request):
        settings = WorkshopSettings.load()
        serializer = WorkshopSettingsSerializer(settings, data=request.data, context={'request': request}, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# ---------------------------------------------------------------------------
# Cliente Portal — Autenticación y Datos
# ---------------------------------------------------------------------------

from django.core import signing


def _make_client_token(client_id):
    """Genera un token firmado con Django signing que encapsula el client_id. Expira en 24 h."""
    return signing.dumps({'cid': client_id}, salt='client-portal')


def _read_client_token(token_str):
    """Lee y valida un token de cliente. Retorna client_id o None si es inválido/expirado."""
    try:
        data = signing.loads(token_str, salt='client-portal', max_age=86400)  # 24 h
        return data.get('cid')
    except (signing.BadSignature, signing.SignatureExpired):
        return None


def _extract_client_id(request):
    """Extrae client_id del header Authorization: ClientToken <token>."""
    auth = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth.startswith('ClientToken '):
        return None
    return _read_client_token(auth.split(' ', 1)[1])


class ClientAuthToken(APIView):
    """
    Login del portal de clientes — público.
    POST /api/operations/client/auth/
    body: {"phone": "+56912345678", "pin": "1234"}
    Retorna un token firmado si el teléfono y PIN coinciden.
    """
    permission_classes = []
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        phone = request.data.get('phone', '').strip()
        pin = request.data.get('pin', '').strip()

        if not phone or not pin:
            return Response(
                {'error': 'Se requiere teléfono y PIN.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        client = Client.objects.filter(phone=phone).first()

        if not client:
            return Response(
                {'error': 'Teléfono no registrado en nuestros sistemas.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not client.portal_enabled:
            return Response(
                {'error': 'Tu cuenta no tiene el portal habilitado. Consulta al taller.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not client.check_pin(pin):
            return Response(
                {'error': 'PIN incorrecto. Verifica e intenta nuevamente.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        token = _make_client_token(client.id)
        return Response({
            'token': token,
            'client_id': client.id,
            'client_name': f"{client.first_name} {client.last_name}",
        })


class ClientChangePinView(APIView):
    """
    Permite al cliente cambiar su PIN desde el portal.
    POST /api/operations/client/change-pin/
    Header: Authorization: ClientToken <token>
    body: {"pin": "1234"}
    """
    permission_classes = []
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        client_id = _extract_client_id(request)
        if not client_id:
            return Response({'error': 'Token inválido o expirado.'}, status=status.HTTP_401_UNAUTHORIZED)

        client = Client.objects.filter(id=client_id).first()
        if not client:
            return Response({'error': 'Cliente no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        new_pin = request.data.get('pin', '').strip()
        if not new_pin or not new_pin.isdigit() or len(new_pin) != 4:
            return Response({'error': 'El PIN debe ser numérico y tener 4 dígitos.'}, status=status.HTTP_400_BAD_REQUEST)

        client.set_pin(new_pin)
        client.save(update_fields=['pin_hash'])
        return Response({'success': True, 'message': 'PIN cambiado con éxito.'})


class ClientDataView(APIView):
    """
    Dashboard del portal de clientes — lista de vehículos del cliente autenticado.
    GET /api/operations/client/data/
    Header: Authorization: ClientToken <token>
    """
    permission_classes = []
    authentication_classes = []

    def get(self, request, *args, **kwargs):
        client_id = _extract_client_id(request)
        if not client_id:
            return Response({'error': 'Token inválido o expirado.'}, status=status.HTTP_401_UNAUTHORIZED)

        client = Client.objects.filter(id=client_id).first()
        if not client:
            return Response({'error': 'Cliente no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        vehicles = client.vehicles.all()
        data = []
        for vehicle in vehicles:
            active_orders = WorkOrder.objects.filter(vehicle=vehicle).exclude(
                status__in=['DELIVERED', 'CANCELLED']
            ).order_by('-created_at')
            past_orders = WorkOrder.objects.filter(
                vehicle=vehicle, status='DELIVERED'
            ).order_by('-created_at')[:10]

            active_orders_data = []
            for order in active_orders:
                items = order.items.all()
                service_desc = ', '.join(
                    [i.description for i in items if i.is_labor]
                ) or order.desired_service or 'Servicio General'
                active_orders_data.append({
                    'id': order.id,
                    'status': order.get_status_display(),
                    'raw_status': order.status,
                    'created_at': order.created_at,
                    'service': service_desc,
                })

            past_orders_data = []
            for order in past_orders:
                items = order.items.all()
                service_desc = ', '.join(
                    [i.description for i in items if i.is_labor]
                ) or order.desired_service or 'Servicio General'
                past_orders_data.append({
                    'id': order.id,
                    'status': order.get_status_display(),
                    'raw_status': order.status,
                    'created_at': order.created_at,
                    'service': service_desc,
                })

            pending_maintenance = ScheduledMaintenance.objects.filter(
                vehicle=vehicle, status__in=['PENDING', 'NOTIFIED', 'OVERDUE']
            ).count()

            data.append({
                'vehicle': {
                    'id': vehicle.id,
                    'make': vehicle.make,
                    'model': vehicle.model,
                    'year': vehicle.year,
                    'license_plate': vehicle.license_plate,
                    'color': vehicle.color,
                },
                'active_orders': active_orders_data,
                'past_orders': past_orders_data,
                'pending_maintenance': pending_maintenance,
            })

        return Response({
            'client_name': f"{client.first_name} {client.last_name}",
            'vehicles': data,
        })


class ClientVehicleDetailView(APIView):
    """
    Ficha técnica completa de un vehículo — solo si pertenece al cliente autenticado.
    GET /api/operations/client/vehicles/<pk>/
    Header: Authorization: ClientToken <token>
    """
    permission_classes = []
    authentication_classes = []

    def get(self, request, pk=None):
        client_id = _extract_client_id(request)
        if not client_id:
            return Response({'error': 'Token inválido o expirado.'}, status=status.HTTP_401_UNAUTHORIZED)

        vehicle = Vehicle.objects.filter(id=pk, client_id=client_id).first()
        if not vehicle:
            return Response({'error': 'Vehículo no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        # Datos del vehículo
        vehicle_data = {
            'id': vehicle.id,
            'make': vehicle.make,
            'model': vehicle.model,
            'year': vehicle.year,
            'license_plate': vehicle.license_plate,
            'color': vehicle.color,
            'transmission_type': vehicle.get_transmission_type_display(),
            'fuel_type': vehicle.get_fuel_type_display(),
            'vin': vehicle.vin,
            'engine_number': vehicle.engine_number,
            'engine_displacement': vehicle.engine_displacement,
            'mileage': vehicle.mileage,
        }

        # Partes instaladas
        parts = VehiclePart.objects.filter(vehicle=vehicle).order_by('-installed_at')
        parts_data = [{
            'id': p.id,
            'name': p.name,
            'oem_number': p.oem_number,
            'brand': p.brand,
            'category': p.get_category_display(),
            'installed_at': p.installed_at,
            'installed_mileage': p.installed_mileage,
            'notes': p.notes,
        } for p in parts]

        # Historial de mantenciones
        records = MaintenanceRecord.objects.filter(vehicle=vehicle).order_by('-date_performed')
        records_data = [{
            'id': r.id,
            'maintenance_type': r.get_maintenance_type_display(),
            'description': r.description,
            'mileage': r.mileage,
            'date_performed': r.date_performed,
            'product_details': r.product_details,
            'cost': float(r.cost) if r.cost else None,
            'performed_by': r.performed_by,
        } for r in records]

        # Mantenciones programadas
        scheduled = ScheduledMaintenance.objects.filter(vehicle=vehicle).order_by('due_date', 'due_mileage')
        scheduled_data = [{
            'id': s.id,
            'maintenance_type': s.get_maintenance_type_display(),
            'description': s.description,
            'due_mileage': s.due_mileage,
            'due_date': s.due_date,
            'status': s.get_status_display(),
            'raw_status': s.status,
            'notes': s.notes,
        } for s in scheduled]

        # Órdenes de trabajo (todas)
        work_orders = WorkOrder.objects.filter(vehicle=vehicle).order_by('-created_at')
        wo_data = []
        for wo in work_orders:
            items = wo.items.all()
            wo_data.append({
                'id': wo.id,
                'status': wo.get_status_display(),
                'raw_status': wo.status,
                'created_at': wo.created_at,
                'updated_at': wo.updated_at,
                'visit_reason': wo.visit_reason,
                'desired_service': wo.desired_service,
                'symptoms': wo.symptoms,
                'mileage': wo.mileage,
                'items': [{
                    'description': item.description,
                    'quantity': float(item.quantity),
                    'unit_price': float(item.unit_price),
                    'total_price': float(item.total_price),
                    'is_labor': item.is_labor,
                } for item in items],
            })

        return Response({
            'vehicle': vehicle_data,
            'parts': parts_data,
            'maintenance_records': records_data,
            'scheduled_maintenance': scheduled_data,
            'work_orders': wo_data,
        })


class AIDiagnosticsView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        import base64
        import mimetypes
        import pypdf

        work_order_id = request.data.get('work_order_id')
        extracted_texts = []
        base64_images = []
        
        if work_order_id:
            try:
                work_order = WorkOrder.objects.select_related('vehicle').prefetch_related('attachments').get(id=work_order_id)
                vehicle = work_order.vehicle
                symptoms = work_order.symptoms or "No especificado"
                visit_reason = work_order.visit_reason or "No especificado"
                desired_service = work_order.desired_service or "No especificado"
                
                vehicle_info = (
                    f"Vehículo: {vehicle.make} {vehicle.model} ({vehicle.year})\n"
                    f"Transmisión: {vehicle.get_transmission_type_display()}\n"
                    f"Combustible: {vehicle.get_fuel_type_display()}\n"
                    f"Cilindrada: {vehicle.engine_displacement or 'No especificado'}\n"
                    f"Kilometraje OT: {work_order.mileage} km"
                )

                # Process attachments
                for attachment in work_order.attachments.all():
                    if not attachment.file:
                        continue
                    filename = attachment.file.name.lower()
                    mime_type, _ = mimetypes.guess_type(filename)
                    if filename.endswith('.pdf'):
                        try:
                            attachment.file.seek(0)
                            reader = pypdf.PdfReader(attachment.file)
                            pdf_text = ""
                            for page in reader.pages:
                                pdf_text += page.extract_text() or ""
                            if pdf_text.strip():
                                extracted_texts.append(f"--- Contenido extraído del PDF: {attachment.file_name} ---\n{pdf_text}\n")
                        except Exception as pdf_err:
                            print(f"Error parseando PDF {attachment.file_name}: {pdf_err}")
                    elif filename.endswith('.txt') or (mime_type and mime_type.startswith('text/')):
                        try:
                            attachment.file.seek(0)
                            txt_content = attachment.file.read().decode('utf-8', errors='ignore')
                            if txt_content.strip():
                                extracted_texts.append(f"--- Contenido extraído del archivo: {attachment.file_name} ---\n{txt_content}\n")
                        except Exception as txt_err:
                            print(f"Error leyendo archivo de texto {attachment.file_name}: {txt_err}")
                    elif mime_type and mime_type.startswith('image/'):
                        try:
                            attachment.file.seek(0)
                            file_bytes = attachment.file.read()
                            b64_str = base64.b64encode(file_bytes).decode('utf-8')
                            base64_images.append({
                                "url": f"data:{mime_type};base64,{b64_str}",
                                "name": attachment.file_name
                            })
                        except Exception as img_err:
                            print(f"Error procesando imagen {attachment.file_name}: {img_err}")

            except WorkOrder.DoesNotExist:
                return Response({'error': 'Orden de trabajo no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            symptoms = request.data.get('symptoms')
            visit_reason = request.data.get('visit_reason', 'No especificado')
            desired_service = request.data.get('desired_service', 'No especificado')
            vehicle_info = request.data.get('vehicle_info', 'Vehículo: No especificado')
            
            if not symptoms:
                return Response({'error': 'Por favor, describe los síntomas del vehículo.'}, status=status.HTTP_400_BAD_REQUEST)
                
        try:
            client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
            
            prompt = f"""
            Eres 'MecanIA', un experto mecánico automotriz con décadas de experiencia.
            
            Información del Vehículo:
            {vehicle_info}
            
            Datos de la Orden de Trabajo / Visita:
            - Motivo de la visita: {visit_reason}
            - Servicio solicitado: {desired_service}
            - Síntomas reportados: {symptoms}
            """
            
            if extracted_texts:
                prompt += "\nInformación técnica y reportes escaneados extraídos de los archivos adjuntos:\n"
                prompt += "\n".join(extracted_texts)
                
            if base64_images:
                prompt += f"\nSe han adjuntado {len(base64_images)} imagen(es) de diagnóstico. Analiza visualmente cualquier anomalía, códigos de error o problemas físicos visibles en estas imágenes."
                
            prompt += """
            Proporciona un pre-diagnóstico técnico estructurado (máximo 4 párrafos), indicando las posibles causas técnicas del problema,
            los componentes específicos a revisar, y sugerencias de mantenimiento basadas en los datos técnicos del vehículo y los archivos adjuntos.
            Usa un tono profesional, claro y amable.
            """

            user_content = [{"type": "text", "text": prompt}]
            for img in base64_images:
                user_content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": img["url"]
                    }
                })

            messages = [
                {"role": "system", "content": "Eres un asistente mecánico experto."},
                {"role": "user", "content": user_content}
            ]
            
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=600,
                temperature=0.7
            )
            
            ai_message = response.choices[0].message.content
            return Response({'diagnosis': ai_message})
            
        except Exception as e:
            print("Error OpenAI:", str(e))
            return Response({'error': 'Error al conectar con la Inteligencia Artificial.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class AITranscribeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        audio_file = request.FILES.get('audio')
        if not audio_file:
            return Response({'error': 'No se proporcionó ningún archivo de audio.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
            
            # Pass file as tuple to preserve filename extension for Whisper api
            file_data = (audio_file.name, audio_file.read(), audio_file.content_type)
            
            transcription = client.audio.transcriptions.create(
              model="whisper-1", 
              file=file_data,
              language="es"
            )
            
            return Response({'transcription': transcription.text})
            
        except Exception as e:
            print("Error OpenAI Whisper:", str(e))
            return Response({'error': f'Error al transcribir el audio: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

from django.utils import timezone
from django.db.models import Sum, Count
from datetime import timedelta

class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start_of_week = start_of_day - timedelta(days=start_of_day.weekday())
        start_of_month = start_of_day.replace(day=1)

        # Sales Calculations from payments
        from finance.models import Payment
        sales_day = Payment.objects.filter(date__gte=start_of_day).aggregate(total=Sum('amount'))['total'] or 0
        sales_week = Payment.objects.filter(date__gte=start_of_week).aggregate(total=Sum('amount'))['total'] or 0
        sales_month = Payment.objects.filter(date__gte=start_of_month).aggregate(total=Sum('amount'))['total'] or 0

        # OT States
        ot_stats = WorkOrder.objects.values('status').annotate(count=Count('id'))
        ot_status_counts = {stat['status']: stat['count'] for stat in ot_stats}

        # Most Visited Brands/Models
        vehicles_visited = Vehicle.objects.annotate(
            visits=Count('work_orders')
        ).filter(visits__gt=0).order_by('-visits')[:5]
        
        most_visited_vehicles = [{
            'make': v.make,
            'model': v.model,
            'visits': v.visits
        } for v in vehicles_visited]

        # Most Sold Products / Services
        most_sold_items = WorkOrderItem.objects.values('description').annotate(
            total_qty=Sum('quantity')
        ).order_by('-total_qty')[:5]

        items_sold = [{
            'description': item['description'],
            'quantity': float(item['total_qty']),
        } for item in most_sold_items]

        return Response({
            'sales': {
                'day': float(sales_day),
                'week': float(sales_week),
                'month': float(sales_month),
            },
            'ot_status': ot_status_counts,
            'most_visited_vehicles': most_visited_vehicles,
            'most_sold_items': items_sold
        })

from django.contrib.auth.models import User
from rest_framework import serializers

class UserSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source='profile.role', required=False)
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'password']
        extra_kwargs = {'password': {'write_only': True, 'required': False}}

    def create(self, validated_data):
        profile_data = validated_data.pop('profile', {})
        role = profile_data.get('role', 'MECHANIC')
        password = validated_data.pop('password', None)
        
        user = User.objects.create(**validated_data)
        if password:
            user.set_password(password)
            user.save()
            
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = role
        profile.save()
        
        if role == 'ADMIN':
            user.is_staff = True
            user.is_superuser = True
        else:
            user.is_staff = False
            user.is_superuser = False
        user.save()
        return user

    def update(self, instance, validated_data):
        profile_data = validated_data.pop('profile', {})
        role = profile_data.get('role')
        password = validated_data.pop('password', None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
            
        if password:
            instance.set_password(password)
        instance.save()
        
        if role:
            profile, _ = UserProfile.objects.get_or_create(user=instance)
            profile.role = role
            profile.save()
            if role == 'ADMIN':
                instance.is_staff = True
                instance.is_superuser = True
            else:
                instance.is_staff = False
                instance.is_superuser = False
            instance.save()
        return instance

class UserViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = User.objects.all().order_by('-id')
    serializer_class = UserSerializer


# ── ViewSets para Ficha del Vehículo ──

class VehiclePartViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = VehiclePartSerializer

    def get_queryset(self):
        qs = VehiclePart.objects.select_related('vehicle', 'work_order').all()
        vehicle_id = self.request.query_params.get('vehicle')
        if vehicle_id:
            qs = qs.filter(vehicle_id=vehicle_id)
        return qs.order_by('-installed_at')


class MaintenanceRecordViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = MaintenanceRecordSerializer

    def get_queryset(self):
        qs = MaintenanceRecord.objects.select_related('vehicle', 'work_order').all()
        vehicle_id = self.request.query_params.get('vehicle')
        if vehicle_id:
            qs = qs.filter(vehicle_id=vehicle_id)
        return qs.order_by('-date_performed')


class ScheduledMaintenanceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ScheduledMaintenanceSerializer

    def get_queryset(self):
        qs = ScheduledMaintenance.objects.select_related('vehicle', 'vehicle__client').all()
        vehicle_id = self.request.query_params.get('vehicle')
        if vehicle_id:
            qs = qs.filter(vehicle_id=vehicle_id)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    @action(detail=True, methods=['post'])
    def mark_completed(self, request, pk=None):
        """Marca una mantención programada como completada."""
        scheduled = self.get_object()
        scheduled.status = 'COMPLETED'
        scheduled.save()
        return Response(ScheduledMaintenanceSerializer(scheduled).data)

    @action(detail=True, methods=['post'])
    def notify_client(self, request, pk=None):
        """Envía recordatorio de mantención al cliente vía WhatsApp."""
        scheduled = self.get_object()
        client = scheduled.vehicle.client

        if not client or not client.phone:
            return Response(
                {'error': 'El vehículo no tiene un cliente con teléfono asignado.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        due_info = ""
        if scheduled.due_date:
            due_info += f"Fecha: {scheduled.due_date.strftime('%d/%m/%Y')}"
        if scheduled.due_mileage:
            if due_info:
                due_info += " o "
            due_info += f"Kilometraje: {scheduled.due_mileage:,} km"

        message = (
            f"Hola {client.first_name}, te recordamos que tu vehículo "
            f"{scheduled.vehicle.make} {scheduled.vehicle.model} "
            f"(Patente: {scheduled.vehicle.license_plate}) tiene una mantención pendiente:\n\n"
            f"📋 {scheduled.get_maintenance_type_display()}: {scheduled.description}\n"
            f"📅 {due_info}\n\n"
            f"Te esperamos en el taller. ¡Agenda tu hora!"
        )

        from .services import send_whatsapp_message
        success = send_whatsapp_message(number=client.phone, text=message)
        if success:
            scheduled.status = 'NOTIFIED'
            scheduled.notified_at = timezone.now()
            scheduled.save()
            return Response({'success': True, 'message': 'Recordatorio enviado vía WhatsApp.'})
        else:
            return Response(
                {'error': 'Fallo al enviar notificación al microservicio o WhatsApp no disponible.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class MaintenanceAlertsView(APIView):
    """Lista mantenciones próximas a vencer (< 30 días) o vencidas para el dashboard."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from datetime import timedelta
        today = timezone.now().date()
        threshold_date = today + timedelta(days=30)

        # Auto-update overdue
        ScheduledMaintenance.objects.filter(
            status__in=['PENDING', 'NOTIFIED'],
            due_date__lt=today
        ).update(status='OVERDUE')

        alerts = ScheduledMaintenance.objects.select_related(
            'vehicle', 'vehicle__client'
        ).filter(
            status__in=['PENDING', 'NOTIFIED', 'OVERDUE'],
            due_date__lte=threshold_date
        ).order_by('due_date')[:20]

        return Response(ScheduledMaintenanceSerializer(alerts, many=True).data)


class WhatsAppSessionView(APIView):
    """Endpoints públicos para sincronizar los archivos de autenticación de WhatsApp en la base de datos."""
    permission_classes = []
    authentication_classes = []

    def _validate_internal_key(self, request):
        from django.conf import settings
        expected_key = getattr(settings, 'INTERNAL_API_KEY', None)
        provided_key = request.headers.get('X-Mecania-Secret-Key') or request.META.get('HTTP_X_MECANIA_SECRET_KEY')
        if expected_key and provided_key != expected_key:
            return False
        return True

    def _encrypt_data(self, data):
        import base64
        from cryptography.fernet import Fernet
        from django.conf import settings
        if not data:
            return data
        key = settings.SECRET_KEY.encode('utf-8')
        if len(key) < 32:
            key = key.ljust(32, b'\0')
        else:
            key = key[:32]
        b64_key = base64.urlsafe_b64encode(key)
        f = Fernet(b64_key)
        return f.encrypt(data.encode('utf-8')).decode('utf-8')

    def _decrypt_data(self, data):
        import base64
        from cryptography.fernet import Fernet
        from django.conf import settings
        if not data:
            return data
        key = settings.SECRET_KEY.encode('utf-8')
        if len(key) < 32:
            key = key.ljust(32, b'\0')
        else:
            key = key[:32]
        b64_key = base64.urlsafe_b64encode(key)
        f = Fernet(b64_key)
        try:
            return f.decrypt(data.encode('utf-8')).decode('utf-8')
        except Exception:
            return data

    def get(self, request):
        if not self._validate_internal_key(request):
            return Response({'error': 'Unauthorized'}, status=403)
        from .models import WhatsAppSession
        sessions = WhatsAppSession.objects.all()
        data = {s.key: self._decrypt_data(s.data) for s in sessions}
        return Response(data)

    def post(self, request):
        if not self._validate_internal_key(request):
            return Response({'error': 'Unauthorized'}, status=403)
        from .models import WhatsAppSession
        
        batch = request.data.get('batch')
        if batch and isinstance(batch, dict):
            # Usar una transacción para insertar/eliminar todo en una sola operación de base de datos
            # Ordenamos las llaves para garantizar un orden de bloqueo determinista y evitar deadlocks
            from django.db import transaction
            with transaction.atomic():
                for key in sorted(batch.keys()):
                    data = batch[key]
                    if data is None or data == '':
                        WhatsAppSession.objects.filter(key=key).delete()
                    else:
                        encrypted_data = self._encrypt_data(data)
                        WhatsAppSession.objects.update_or_create(
                            key=key,
                            defaults={'data': encrypted_data}
                        )
            return Response({'success': True, 'action': 'batch_saved'})

        key = request.data.get('key')
        data = request.data.get('data')

        if not key:
            return Response({'error': 'Key is required'}, status=400)

        # Si el valor de data es vacío o nulo, significa que el archivo se eliminó localmente
        if data is None or data == '':
            WhatsAppSession.objects.filter(key=key).delete()
            return Response({'success': True, 'action': 'deleted'})

        encrypted_data = self._encrypt_data(data)
        session_obj, created = WhatsAppSession.objects.update_or_create(
            key=key,
            defaults={'data': encrypted_data}
        )
        return Response({'success': True, 'action': 'saved'})

    def delete(self, request):
        if not self._validate_internal_key(request):
            return Response({'error': 'Unauthorized'}, status=403)
        from .models import WhatsAppSession
        keep_creds = request.query_params.get('keep_creds') == 'true'
        if keep_creds:
            WhatsAppSession.objects.exclude(key='creds.json').delete()
            return Response({'success': True, 'action': 'cleared_except_creds'})
        WhatsAppSession.objects.all().delete()
        return Response({'success': True, 'action': 'cleared'})


class WhatsAppFlowViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = WhatsAppFlowSerializer
    queryset = WhatsAppFlow.objects.all().order_by('id')
    pagination_class = None


class WhatsAppChatListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Max
        from .models import WhatsAppMessage, Client

        # Obtener los números de teléfono únicos y su último mensaje timestamp
        chats_qs = WhatsAppMessage.objects.values('phone').annotate(
            last_timestamp=Max('timestamp')
        ).order_by('-last_timestamp')

        chats = []
        for chat in chats_qs:
            phone = chat['phone']
            last_msg = WhatsAppMessage.objects.filter(phone=phone).order_by('-timestamp').first()

            # Intentar encontrar el cliente correspondiente
            clean_num = ''.join(filter(str.isdigit, phone))
            client_obj = None
            if len(clean_num) >= 8:
                suffix = clean_num[-8:]
                client_obj = Client.objects.filter(phone__icontains=suffix).first()

            client_info = None
            if client_obj:
                vehicles_list = []
                try:
                    for v in client_obj.vehicles.all():
                        vehicles_list.append({
                            "id": v.id,
                            "make": v.make,
                            "model": v.model,
                            "year": v.year,
                            "license_plate": v.license_plate
                        })
                except Exception:
                    # Fallback in case relationship name is different
                    try:
                        for v in client_obj.vehicle_set.all():
                            vehicles_list.append({
                                "id": v.id,
                                "make": v.make,
                                "model": v.model,
                                "year": v.year,
                                "license_plate": v.license_plate
                            })
                    except Exception:
                        pass

                from django.utils import timezone
                now = timezone.now()
                is_silenced = client_obj.bot_silenced_until and client_obj.bot_silenced_until > now
                client_info = {
                    "id": client_obj.id,
                    "name": f"{client_obj.first_name} {client_obj.last_name}",
                    "email": client_obj.email,
                    "phone": client_obj.phone,
                    "vehicles": vehicles_list,
                    "bot_silenced_until": client_obj.bot_silenced_until.isoformat() if client_obj.bot_silenced_until else None,
                    "is_bot_silenced": bool(is_silenced)
                }

            client_name = client_info["name"] if client_info else "Desconocido"
            client_id = client_info["id"] if client_info else None
            vehicles_list = client_info["vehicles"] if client_info else []
            is_bot_silenced = client_info["is_bot_silenced"] if client_info else False
            bot_silenced_until = client_info["bot_silenced_until"] if client_info else None

            chats.append({
                "phone": phone,
                "last_message": last_msg.text if last_msg else "",
                "last_sender": last_msg.sender if last_msg else "client",
                "last_timestamp": chat['last_timestamp'],
                "last_time": chat['last_timestamp'].isoformat() if chat['last_timestamp'] else None,
                "client_name": client_name,
                "client_id": client_id,
                "vehicles": vehicles_list,
                "client": client_info,
                "is_bot_silenced": is_bot_silenced,
                "bot_silenced_until": bot_silenced_until
            })

        return Response(chats, status=status.HTTP_200_OK)


class WhatsAppMessageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import WhatsAppMessage
        from django.db.models import Q
        phone = request.query_params.get('phone', '').strip().replace(' ', '+')
        if not phone:
            return Response({'error': 'Parámetro phone es requerido'}, status=400)

        if phone.startswith('+'):
            alt_phone = phone[1:]
        else:
            alt_phone = '+' + phone

        messages = WhatsAppMessage.objects.filter(Q(phone=phone) | Q(phone=alt_phone)).order_by('timestamp')
        serializer = WhatsAppMessageSerializer(messages, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WhatsAppManualSendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .models import WhatsAppMessage, Client
        phone = request.data.get('phone')
        text = request.data.get('text')

        if not phone or not text:
            return Response({'error': 'phone y text son requeridos'}, status=status.HTTP_400_BAD_REQUEST)

        clean_num = ''.join(filter(str.isdigit, phone))
        client_obj = None
        if len(clean_num) >= 8:
            suffix = clean_num[-8:]
            client_obj = Client.objects.filter(phone__icontains=suffix).first()

        if client_obj:
            from django.utils import timezone
            from datetime import timedelta
            client_obj.bot_silenced_until = timezone.now() + timedelta(hours=2)
            client_obj.save(update_fields=['bot_silenced_until'])

        try:
            base_whatsapp_url = os.environ.get('WHATSAPP_SERVICE_URL', 'http://localhost:3001')
            whatsapp_service_url = f"{base_whatsapp_url.rstrip('/')}/api/send-message"

            from django.conf import settings
            expected_key = getattr(settings, 'INTERNAL_API_KEY', None)
            headers = {}
            if expected_key:
                headers['X-Mecania-Secret-Key'] = expected_key

            resp = requests.post(whatsapp_service_url, json={
                "number": phone,
                "text": text,
            }, headers=headers, timeout=10)

            msg = WhatsAppMessage.objects.create(
                phone=phone,
                client=client_obj,
                sender='operator',
                text=text
            )

            if resp.status_code == 200:
                serializer = WhatsAppMessageSerializer(msg)
                return Response(serializer.data, status=status.HTTP_200_OK)
            else:
                return Response({'error': f'El microservicio respondió con status: {resp.status_code}'}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as e:
            return Response({'error': f'No se pudo conectar con el microservicio: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class WhatsAppMessageSyncView(APIView):
    """
    Recibe un lote de mensajes sincronizados de WhatsApp desde el microservicio
    y los guarda en la base de datos de manera masiva, asociándolos a los clientes correctos.
    """
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        from django.conf import settings
        expected_key = getattr(settings, 'INTERNAL_API_KEY', None)
        provided_key = request.headers.get('X-Mecania-Secret-Key') or request.META.get('HTTP_X_MECANIA_SECRET_KEY')
        if expected_key and provided_key != expected_key:
            return Response({"error": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)

        messages_data = request.data.get('messages', [])
        if not isinstance(messages_data, list):
            return Response({"error": "messages must be a list"}, status=status.HTTP_400_BAD_REQUEST)

        from .models import WhatsAppMessage, Client
        from django.utils import timezone
        import datetime

        created_count = 0
        clients_cache = {}

        def get_client(phone_str):
            clean_num = ''.join(filter(str.isdigit, phone_str))
            if len(clean_num) < 8:
                return None
            suffix = clean_num[-8:]
            if suffix not in clients_cache:
                client_obj = Client.objects.filter(phone__icontains=suffix).first()
                clients_cache[suffix] = client_obj
            return clients_cache[suffix]

        for item in messages_data:
            phone = item.get('phone', '').strip()
            text = item.get('text', '').strip()
            sender = item.get('sender', 'client') # client, assistant, operator
            timestamp_unix = item.get('timestamp')

            if not phone or not text or timestamp_unix is None:
                continue

            clean_num = phone.replace('@s.whatsapp.net', '').replace('@lid', '')
            if not clean_num.startswith('+'):
                clean_num = '+' + clean_num

            client_obj = get_client(clean_num)
            
            # Normalizar el número al del cliente si existe, para evitar bifurcaciones por números @lid o con variaciones de código de país
            if client_obj and client_obj.phone:
                clean_num = client_obj.phone

            dt_utc = datetime.datetime.fromtimestamp(timestamp_unix, tz=datetime.timezone.utc)
            # Ventana de tolerancia más amplia para mensajes salientes (30s) ya que el timestamp
            # de Django (auto_now_add) y el de Baileys (messageTimestamp) pueden diferir por latencia/clock drift.
            tolerance = 30 if sender in ('assistant', 'operator') else 5
            start_dt = dt_utc - datetime.timedelta(seconds=tolerance)
            end_dt = dt_utc + datetime.timedelta(seconds=tolerance)

            # Para mensajes salientes (assistant/operator), buscar duplicados contra ambos roles
            # porque Django guarda como 'operator' pero Baileys lo reporta como 'assistant' (fromMe)
            if sender in ('assistant', 'operator'):
                sender_filter = {'sender__in': ['assistant', 'operator']}
            else:
                sender_filter = {'sender': sender}

            exists = WhatsAppMessage.objects.filter(
                phone=clean_num,
                text=text,
                timestamp__range=(start_dt, end_dt),
                **sender_filter
            ).exists()

            if not exists:
                msg = WhatsAppMessage.objects.create(
                    phone=clean_num,
                    client=client_obj,
                    sender=sender,
                    text=text
                )
                WhatsAppMessage.objects.filter(id=msg.id).update(timestamp=dt_utc)
                created_count += 1

        return Response({"success": True, "created": created_count}, status=status.HTTP_200_OK)


class WhatsAppLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            base_whatsapp_url = os.environ.get('WHATSAPP_SERVICE_URL', 'http://localhost:3001')
            whatsapp_logout_url = f"{base_whatsapp_url.rstrip('/')}/api/logout"

            from django.conf import settings
            expected_key = getattr(settings, 'INTERNAL_API_KEY', None)
            headers = {}
            if expected_key:
                headers['X-Mecania-Secret-Key'] = expected_key

            resp = requests.post(whatsapp_logout_url, headers=headers, timeout=10)

            if resp.status_code == 200:
                return Response({'success': True}, status=status.HTTP_200_OK)
            else:
                return Response({'error': f'El microservicio respondió con status: {resp.status_code}'}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as e:
            return Response({'error': f'No se pudo conectar con el microservicio: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WhatsAppStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            base_whatsapp_url = os.environ.get('WHATSAPP_SERVICE_URL', 'http://localhost:3001')
            whatsapp_status_url = f"{base_whatsapp_url.rstrip('/')}/api/status"

            from django.conf import settings
            expected_key = getattr(settings, 'INTERNAL_API_KEY', None)
            headers = {}
            if expected_key:
                headers['X-Mecania-Secret-Key'] = expected_key

            resp = requests.get(whatsapp_status_url, headers=headers, timeout=10)

            if resp.status_code == 200:
                return Response(resp.json(), status=status.HTTP_200_OK)
            else:
                return Response({'error': f'El microservicio respondió con status: {resp.status_code}'}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as e:
            return Response({'error': f'No se pudo conectar con el microservicio: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WhatsAppToggleSilenceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .models import Client
        from django.utils import timezone
        from datetime import timedelta
        
        phone = request.data.get('phone')
        silenced = request.data.get('silenced') # true, false, o toggle si es omitido

        if not phone:
            return Response({'error': 'phone es requerido'}, status=status.HTTP_400_BAD_REQUEST)

        clean_num = ''.join(filter(str.isdigit, phone))
        client_obj = None
        if len(clean_num) >= 8:
            suffix = clean_num[-8:]
            client_obj = Client.objects.filter(phone__icontains=suffix).first()

        if not client_obj:
            return Response({'error': 'Cliente no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        if silenced is not None:
            if silenced:
                client_obj.bot_silenced_until = timezone.now() + timedelta(hours=2)
            else:
                client_obj.bot_silenced_until = None
        else:
            # Toggle
            now = timezone.now()
            is_currently_silenced = client_obj.bot_silenced_until and client_obj.bot_silenced_until > now
            if is_currently_silenced:
                client_obj.bot_silenced_until = None
            else:
                client_obj.bot_silenced_until = now + timedelta(hours=2)

        client_obj.save(update_fields=['bot_silenced_until'])

        now = timezone.now()
        is_silenced = client_obj.bot_silenced_until and client_obj.bot_silenced_until > now

        return Response({
            'success': True,
            'is_bot_silenced': bool(is_silenced),
            'bot_silenced_until': client_obj.bot_silenced_until.isoformat() if client_obj.bot_silenced_until else None
        }, status=status.HTTP_200_OK)




from django.http import HttpResponse, JsonResponse
from django.core.files.storage import FileSystemStorage
from django.conf import settings
import os
import shutil

class DatabaseBackupView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        db_path = settings.DATABASES['default']['NAME']
        if os.path.exists(db_path):
            with open(db_path, 'rb') as f:
                response = HttpResponse(f.read(), content_type='application/x-sqlite3')
                response['Content-Disposition'] = 'attachment; filename="backup_db.sqlite3"'
                return response
        return JsonResponse({'error': 'No se encontró la base de datos'}, status=404)

class DatabaseRestoreView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if 'file' not in request.FILES:
            return JsonResponse({'error': 'No se proporcionó ningún archivo'}, status=400)
        
        file = request.FILES['file']
        db_path = settings.DATABASES['default']['NAME']
        
        # Backup the current just in case, but just replacing it is fine since it's a restore requested
        with open(db_path, 'wb+') as destination:
            for chunk in file.chunks():
                destination.write(chunk)
                
        return JsonResponse({'success': True, 'message': 'Base de datos restaurada correctamente.'})

class WhatsAppClearChatsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .models import WhatsAppMessage
        WhatsAppMessage.objects.all().delete()
        return Response({'success': True, 'message': 'Todos los historiales de chat sincronizados han sido eliminados.'})

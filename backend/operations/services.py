"""
Capa de servicio de Operaciones.

Contiene la regla de negocio más importante del producto (bloqueo de avance
de OT sin evidencia) y el cierre transaccional de la OT con descuento de
inventario. Igual que en finance/services.py, las vistas son delgadas y
delegan aquí.
"""
from decimal import Decimal

from django.db import transaction

from operations.models import WorkOrder, VisualInspection
from inventory.models import Product, StockTransaction


class WorkOrderTransitionError(Exception):
    """Error de negocio al intentar cambiar el estado de una OT."""
    pass


# Estados que representan "avanzar" la atención de la OT más allá del
# diagnóstico inicial. Antes de llegar a cualquiera de estos, toda inspección
# crítica (RED) debe tener evidencia. Esto incluye también pasar a COMPLETED
# o DELIVERED directamente, por si el flujo se salta IN_PROGRESS.
STATES_REQUIRING_EVIDENCE_CHECK = {'IN_PROGRESS', 'COMPLETED', 'DELIVERED'}


def validate_evidence_before_transition(work_order: WorkOrder, new_status: str):
    """
    Bloquea el avance de la OT si existe alguna inspección visual en estado
    RED (crítico) sin evidencia multimedia cargada. Esta es la regla de
    negocio descrita en la especificación funcional ("Evidencia Multimedia
    Obligatoria") y hasta ahora no estaba implementada en el repositorio.

    Se valida siempre en el backend — nunca basta con que el frontend
    deshabilite un botón, porque cualquiera con acceso directo a la API
    podría saltarse esa validación.
    """
    if new_status not in STATES_REQUIRING_EVIDENCE_CHECK:
        return

    missing_evidence = work_order.inspections.filter(
        status='RED',
    ).filter(
        evidence_file=''
    )
    if missing_evidence.exists():
        categorias = ", ".join(missing_evidence.values_list('category', flat=True))
        raise WorkOrderTransitionError(
            "No se puede avanzar la orden de trabajo: existen hallazgos críticos (rojo) "
            f"sin evidencia fotográfica cargada en: {categorias}. "
            "Sube al menos una foto o video por cada hallazgo crítico antes de continuar."
        )


@transaction.atomic
def transition_work_order_status(*, work_order: WorkOrder, new_status: str, user=None):
    """
    Único punto autorizado para cambiar el estado de una OT. Aplica la
    validación de evidencia y, si el nuevo estado es COMPLETED o DELIVERED,
    descuenta el inventario de las piezas usadas dentro de la misma
    transacción — si el descuento falla (ej. stock insuficiente porque algo
    cambió entre la cotización y el cierre), el cambio de estado completo se
    revierte y la OT queda como estaba.
    """
    valid_statuses = dict(WorkOrder.STATUS_CHOICES).keys()
    if new_status not in valid_statuses:
        raise WorkOrderTransitionError(f"Estado '{new_status}' no es válido.")

    validate_evidence_before_transition(work_order, new_status)

    previous_status = work_order.status
    is_first_time_completing = (
        new_status in ('COMPLETED', 'DELIVERED') and previous_status not in ('COMPLETED', 'DELIVERED')
    )

    if is_first_time_completing:
        _discount_inventory_for_work_order(work_order)

    work_order.status = new_status
    work_order.save(update_fields=['status', 'updated_at'])
    return work_order


def _discount_inventory_for_work_order(work_order: WorkOrder):
    """
    Descuenta del inventario cada producto usado en la OT (WorkOrderItem con
    producto asociado), bloqueando las filas de Product para evitar carreras
    si dos OTs se cierran al mismo tiempo usando el mismo repuesto. Si algún
    producto no tiene stock suficiente, lanza una excepción que revierte toda
    la transacción de transition_work_order_status — la OT no cambia de
    estado y ningún stock se descuenta parcialmente.
    """
    items_with_product = work_order.items.filter(product__isnull=False).select_related('product')
    product_ids = [item.product_id for item in items_with_product]
    if not product_ids:
        return

    locked_products = {
        p.id: p for p in Product.objects.select_for_update().filter(id__in=product_ids)
    }

    for item in items_with_product:
        product = locked_products[item.product_id]
        if product.stock_quantity < item.quantity:
            raise WorkOrderTransitionError(
                f"Stock insuficiente para cerrar la OT: '{product.name}' tiene "
                f"{product.stock_quantity} disponibles pero la OT usa {item.quantity}."
            )

    for item in items_with_product:
        product = locked_products[item.product_id]
        product.stock_quantity -= item.quantity
        product.save(update_fields=['stock_quantity'])
        StockTransaction.objects.create(
            product=product,
            work_order=work_order,
            quantity=-item.quantity,
            transaction_type='OUT',
            notes=f"Descuento por cierre de OT-{work_order.id}",
        )


@transaction.atomic
def cancel_work_order(*, work_order: WorkOrder, reason: str = ''):
    """
    Cancela una OT. Si ya se había descontado inventario (porque pasó por
    COMPLETED/DELIVERED y luego se revierte por alguna razón operativa), esta
    función no revierte ese stock automáticamente — cancelar una OT ya
    cerrada es una excepción operativa que debe revisarse manualmente, no
    una reversión automática silenciosa de inventario.
    """
    if work_order.status == 'DELIVERED':
        raise WorkOrderTransitionError(
            "No se puede cancelar una orden de trabajo ya entregada al cliente."
        )
    work_order.status = 'CANCELLED'
    work_order.save(update_fields=['status', 'updated_at'])
    return work_order


def send_whatsapp_message(*, number: str, text: str, document_url: str = None, file_name: str = None) -> bool:
    """
    Envía un mensaje de WhatsApp a través del microservicio de Node.js inyectando
    correctamente la clave de seguridad interna (API Key) en los encabezados.
    """
    import os
    import requests
    import logging
    from django.conf import settings

    logger = logging.getLogger(__name__)

    base_whatsapp_url = os.environ.get('WHATSAPP_SERVICE_URL', 'http://localhost:3001')
    whatsapp_service_url = f"{base_whatsapp_url.rstrip('/')}/api/send-message"

    expected_key = getattr(settings, 'INTERNAL_API_KEY', None)
    headers = {}
    if expected_key:
        headers['X-Mecania-Secret-Key'] = expected_key

    payload = {
        "number": number,
        "text": text
    }
    if document_url:
        payload["documentUrl"] = document_url
    if file_name:
        payload["fileName"] = file_name

    try:
        resp = requests.post(whatsapp_service_url, json=payload, headers=headers, timeout=10)
        if resp.status_code == 200:
            return True
        else:
            logger.error(f"El microservicio de WhatsApp retornó código {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        logger.error(f"Fallo al conectar con el microservicio de WhatsApp: {str(e)}")
        return False


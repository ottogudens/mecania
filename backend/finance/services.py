"""
Capa de servicio de Finanzas / Punto de Venta (POS).

Toda la lógica de negocio del POS vive aquí, no en las vistas. Las vistas
(finance/views.py) son delgadas: reciben el request, llaman a estas funciones,
y traducen excepciones de negocio a respuestas HTTP. Esto facilita testear la
lógica sin pasar por el stack HTTP completo.

Reglas que esta capa garantiza:
- Una venta de mostrador puede mezclar productos (descuentan inventario) y
  servicios (no descuentan inventario) en la misma factura.
- El descuento de inventario y la creación de la factura ocurren en la misma
  transacción de base de datos: si algo falla, todo se revierte, nunca queda
  una factura sin su movimiento de stock correspondiente o viceversa.
- Cancelar una factura revierte el stock que se había descontado.
- Los abonos parciales se acumulan en Invoice.amount_paid y el estado de la
  factura se deriva automáticamente (DRAFT -> PARTIALLY_PAID -> PAID).
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from finance.models import Invoice, InvoiceLineItem, Payment, CashRegisterSession
from inventory.models import Product, Service, StockTransaction
from operations.models import WorkOrder


class POSError(Exception):
    """Error de negocio del punto de venta — las vistas lo traducen a HTTP 400."""
    pass


def require_open_cash_register():
    """
    Verifica que exista una sesión de caja abierta. Todas las operaciones
    del POS (cobrar, crear venta de mostrador, buscar OT para cobrar) deben
    pasar por esta validación para garantizar que cada transacción financiera
    quede dentro de una sesión de caja.
    """
    if not CashRegisterSession.objects.filter(status='OPEN').exists():
        raise POSError(
            "No se puede realizar esta operación: la caja no está abierta. "
            "Abre una sesión de caja antes de continuar."
        )


# ---------------------------------------------------------------------------
# Venta de mostrador (sin Orden de Trabajo)
# ---------------------------------------------------------------------------

@transaction.atomic
def create_counter_sale(*, client_id=None, items, discount_amount=0, registered_by=None):
    """
    Crea una venta de mostrador completa: factura + líneas + descuento de
    inventario, todo en una sola transacción atómica.

    items: lista de dicts, cada uno con:
        - 'product_id' (opcional) o 'service_id' (opcional, exactamente uno)
        - 'quantity'
        - 'unit_price' (opcional; si no se entrega, se usa el precio de catálogo)

    Si cualquier producto no tiene stock suficiente, se aborta toda la venta
    (no se descuenta nada, no se crea la factura).
    """
    require_open_cash_register()

    if not items:
        raise POSError("La venta debe tener al menos un producto o servicio.")

    invoice = Invoice.objects.create(
        client_id=client_id,
        source='COUNTER_SALE',
        discount_amount=Decimal(str(discount_amount or 0)),
        status='DRAFT',
    )

    products_to_lock = [i['product_id'] for i in items if i.get('product_id')]
    locked_products = {
        p.id: p for p in Product.objects.select_for_update().filter(id__in=products_to_lock)
    }

    for item in items:
        product_id = item.get('product_id')
        service_id = item.get('service_id')
        quantity = Decimal(str(item['quantity']))

        if product_id and service_id:
            raise POSError("Cada línea debe ser un producto o un servicio, no ambos.")
        if not product_id and not service_id:
            raise POSError("Cada línea requiere un product_id o service_id.")

        if product_id:
            product = locked_products.get(product_id)
            if product is None:
                raise POSError(f"Producto {product_id} no encontrado.")
            if product.block_sale_without_stock and product.stock_quantity < quantity:
                raise POSError(
                    f"Stock insuficiente para '{product.name}': "
                    f"disponible {product.stock_quantity}, solicitado {quantity}."
                )
            unit_price = Decimal(str(item.get('unit_price', product.price)))
            InvoiceLineItem.objects.create(
                invoice=invoice, product=product, quantity=quantity, unit_price=unit_price,
            )
            product.stock_quantity -= quantity
            product.save(update_fields=['stock_quantity'])
            StockTransaction.objects.create(
                product=product, quantity=-quantity, transaction_type='SALE',
                notes=f"Venta de mostrador FACT-{invoice.id}",
            )
        else:
            try:
                service = Service.objects.get(id=service_id)
            except Service.DoesNotExist:
                raise POSError(f"Servicio {service_id} no encontrado.")
            unit_price = Decimal(str(item.get('unit_price', service.price)))
            InvoiceLineItem.objects.create(
                invoice=invoice, service=service, quantity=quantity, unit_price=unit_price,
            )

    invoice.recalculate_totals()
    invoice.status = 'SENT'
    invoice.save(update_fields=['status'])
    return invoice


# ---------------------------------------------------------------------------
# Cobro / abono / cancelación de Orden de Trabajo
# ---------------------------------------------------------------------------

@transaction.atomic
def get_or_create_invoice_for_work_order(work_order: WorkOrder) -> Invoice:
    """
    Punto de entrada del POS cuando se busca una OT para cobrarla. Si la OT
    todavía no tiene factura asociada, la crea (en estado DRAFT) a partir de
    sus WorkOrderItem actuales. Si ya existe, simplemente la recalcula y la
    devuelve — así el POS siempre opera sobre montos actualizados.
    """
    require_open_cash_register()

    invoice, created = Invoice.objects.get_or_create(
        work_order=work_order,
        defaults={'source': 'WORK_ORDER', 'status': 'DRAFT'},
    )
    invoice.recalculate_totals()
    return invoice


@transaction.atomic
def charge_invoice(*, invoice_id, amount, payment_method, reference_number='', registered_by=None):
    """
    Registra un pago (total o parcial = abono) contra una factura, ya sea de
    OT o de venta de mostrador. Actualiza amount_paid y deriva el status:
      - amount_paid == 0           -> sin cambio (DRAFT/SENT)
      - 0 < amount_paid < total    -> PARTIALLY_PAID (abono)
      - amount_paid >= total       -> PAID

    Si la factura está CANCELLED, se rechaza el pago — no se puede cobrar
    algo que ya fue anulado.
    """
    require_open_cash_register()

    invoice = Invoice.objects.select_for_update().get(id=invoice_id)

    if invoice.status == 'CANCELLED':
        raise POSError("No se puede registrar un pago sobre una factura cancelada.")
    if invoice.status == 'PAID':
        raise POSError("Esta factura ya está pagada en su totalidad.")

    amount = Decimal(str(amount))
    if amount <= 0:
        raise POSError("El monto del pago debe ser mayor a cero.")

    remaining = invoice.balance_due
    if amount > remaining:
        raise POSError(
            f"El monto ({amount}) excede el saldo pendiente ({remaining}). "
            "Si quieres registrar exactamente el saldo, usa ese valor."
        )

    payment = Payment.objects.create(
        invoice=invoice,
        amount=amount,
        payment_method=payment_method,
        reference_number=reference_number,
        registered_by=registered_by,
    )

    invoice.amount_paid = invoice.amount_paid + amount
    invoice.status = 'PAID' if invoice.amount_paid >= invoice.total_amount else 'PARTIALLY_PAID'
    invoice.save(update_fields=['amount_paid', 'status', 'updated_at'])

    return invoice, payment


@transaction.atomic
def cancel_invoice(*, invoice_id, reason=''):
    """
    Cancela una factura. Si tenía líneas de venta de mostrador con productos,
    revierte el descuento de inventario (devuelve el stock). Si la factura
    está atada a una OT, NO cancela la OT — eso es una decisión operativa
    separada que vive en operations.services (ver cancel_work_order).

    Una factura ya pagada en su totalidad no se puede cancelar por esta vía
    para evitar anulaciones accidentales de ventas cerradas: primero debe
    revertirse explícitamente (fuera de alcance de este servicio).
    """
    invoice = Invoice.objects.select_for_update().get(id=invoice_id)

    if invoice.status == 'PAID':
        raise POSError(
            "No se puede cancelar una factura ya pagada en su totalidad. "
            "Si necesitas anularla, contacta a administración para un proceso de reverso."
        )
    if invoice.status == 'CANCELLED':
        raise POSError("Esta factura ya está cancelada.")

    if not invoice.work_order_id:
        for line in invoice.line_items.select_related('product').all():
            if line.product_id:
                product = line.product
                product.stock_quantity += line.quantity
                product.save(update_fields=['stock_quantity'])
                StockTransaction.objects.create(
                    product=product, quantity=line.quantity, transaction_type='ADJUSTMENT',
                    notes=f"Reverso por cancelación de FACT-{invoice.id}",
                )

    invoice.status = 'CANCELLED'
    invoice.cancelled_reason = reason
    invoice.save(update_fields=['status', 'cancelled_reason', 'updated_at'])
    return invoice

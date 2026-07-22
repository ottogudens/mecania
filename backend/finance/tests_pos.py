"""
Tests funcionales de la lógica de negocio crítica agregada:
- Bloqueo de avance de OT sin evidencia en hallazgos críticos.
- Descuento de inventario atómico al cerrar una OT.
- POS: venta de mostrador (productos + servicios), cobro, abono, cancelación.

Se corren con el test runner de Django (sqlite en memoria), no contra la
base de datos de desarrollo.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase

from operations.models import Client, Vehicle, WorkOrder, WorkOrderItem, VisualInspection
from operations.services import (
    transition_work_order_status,
    cancel_work_order,
    WorkOrderTransitionError,
)
from inventory.models import Product, Service, ServiceCategory
from finance.models import Invoice
from finance.services import (
    create_counter_sale,
    get_or_create_invoice_for_work_order,
    charge_invoice,
    cancel_invoice,
    POSError,
)


class EvidenceRequiredTests(TestCase):
    def setUp(self):
        self.client_obj = Client.objects.create(first_name="Juan", last_name="Pérez", phone="+56911111111")
        self.vehicle = Vehicle.objects.create(
            license_plate="ABCD12", make="Toyota", model="Yaris", year=2020, client=self.client_obj,
        )
        self.wo = WorkOrder.objects.create(vehicle=self.vehicle, mileage=50000, fuel_level=50)

    def test_no_avanza_sin_evidencia_en_hallazgo_rojo(self):
        VisualInspection.objects.create(
            work_order=self.wo, category="Frenos", status="RED", observations="Pastillas gastadas",
        )
        with self.assertRaises(WorkOrderTransitionError):
            transition_work_order_status(work_order=self.wo, new_status="IN_PROGRESS")
        self.wo.refresh_from_db()
        self.assertEqual(self.wo.status, "PENDING")

    def test_si_avanza_con_evidencia_cargada(self):
        from django.core.files.base import ContentFile
        inspection = VisualInspection.objects.create(
            work_order=self.wo, category="Frenos", status="RED", observations="Pastillas gastadas",
        )
        inspection.evidence_file.save("foto.jpg", ContentFile(b"contenido-fake-de-imagen"))

        transition_work_order_status(work_order=self.wo, new_status="IN_PROGRESS")
        self.wo.refresh_from_db()
        self.assertEqual(self.wo.status, "IN_PROGRESS")

    def test_hallazgo_amarillo_o_verde_no_bloquea(self):
        VisualInspection.objects.create(work_order=self.wo, category="Filtros", status="YELLOW")
        VisualInspection.objects.create(work_order=self.wo, category="Motor", status="GREEN")
        # No debe lanzar excepción
        transition_work_order_status(work_order=self.wo, new_status="IN_PROGRESS")
        self.wo.refresh_from_db()
        self.assertEqual(self.wo.status, "IN_PROGRESS")


class InventoryDiscountOnCloseTests(TestCase):
    def setUp(self):
        self.client_obj = Client.objects.create(first_name="Ana", last_name="Lopez", phone="+56922222222")
        self.vehicle = Vehicle.objects.create(
            license_plate="XYZ999", make="Nissan", model="Versa", year=2019, client=self.client_obj,
        )
        self.wo = WorkOrder.objects.create(vehicle=self.vehicle, mileage=80000, fuel_level=70)
        self.product = Product.objects.create(name="Filtro de aceite", sku="FA-001", stock_quantity=10, price=Decimal("5000"))
        WorkOrderItem.objects.create(
            work_order=self.wo, product=self.product, description="Filtro de aceite",
            quantity=Decimal("2"), unit_price=Decimal("5000"),
        )

    def test_descuenta_stock_al_completar_ot(self):
        transition_work_order_status(work_order=self.wo, new_status="COMPLETED")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 8)

    def test_no_descuenta_dos_veces_si_ya_estaba_completada(self):
        transition_work_order_status(work_order=self.wo, new_status="COMPLETED")
        transition_work_order_status(work_order=self.wo, new_status="DELIVERED")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 8)  # no se descontó de nuevo

    def test_falla_si_stock_insuficiente_y_no_descuenta_nada(self):
        self.product.stock_quantity = 1
        self.product.save()
        with self.assertRaises(WorkOrderTransitionError):
            transition_work_order_status(work_order=self.wo, new_status="COMPLETED")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 1)  # transacción revertida, nada se descontó
        self.wo.refresh_from_db()
        self.assertEqual(self.wo.status, "PENDING")  # tampoco cambió el estado


class POSCounterSaleTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="cashier_sale", password="password")
        from finance.models import CashRegisterSession
        CashRegisterSession.objects.create(opened_by=self.user)
        self.product = Product.objects.create(name="Aceite 5W30", sku="AC-001", stock_quantity=20, price=Decimal("12000"))
        self.category = ServiceCategory.objects.create(name="Mantenimiento")
        self.service = Service.objects.create(
            name="Cambio de aceite express", category=self.category, price=Decimal("15000"),
        )

    def test_venta_mostrador_mezcla_producto_y_servicio(self):
        invoice = create_counter_sale(
            client_id=None,
            items=[
                {"product_id": self.product.id, "quantity": 2},
                {"service_id": self.service.id, "quantity": 1},
            ],
        )
        self.assertEqual(invoice.source, "COUNTER_SALE")
        self.assertIsNone(invoice.work_order_id)
        self.assertEqual(invoice.line_items.count(), 2)
        # 2 * 12000 + 1 * 15000 = 39000 (total con IVA)
        self.assertEqual(invoice.total_amount, Decimal("39000"))
        self.assertEqual(invoice.subtotal, Decimal("32773.11"))
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 18)  # descontó 2

    def test_venta_mostrador_con_descuento_y_cliente(self):
        client = Client.objects.create(first_name="Juan", last_name="Pérez")
        invoice = create_counter_sale(
            client_id=client.id,
            discount_amount=Decimal("4000"),
            items=[
                {"product_id": self.product.id, "quantity": 2},
            ],
        )
        self.assertEqual(invoice.client_id, client.id)
        # 2 * 12000 = 24000 - 4000 = 20000 final
        self.assertEqual(invoice.discount_amount, Decimal("4000"))
        self.assertEqual(invoice.total_amount, Decimal("20000"))
        self.assertEqual(invoice.subtotal, Decimal("16806.72"))

    def test_venta_mostrador_falla_si_no_hay_stock(self):
        self.product.stock_quantity = 1
        self.product.save()
        with self.assertRaises(POSError):
            create_counter_sale(client_id=None, items=[{"product_id": self.product.id, "quantity": 5}])
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 1)  # no se tocó
        self.assertEqual(Invoice.objects.count(), 0)  # no quedó factura huérfana


class POSChargeAndCancelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="cashier_charge", password="password")
        from finance.models import CashRegisterSession
        CashRegisterSession.objects.create(opened_by=self.user)
        self.product = Product.objects.create(name="Bujía", sku="BJ-001", stock_quantity=10, price=Decimal("3000"))
        self.invoice = create_counter_sale(client_id=None, items=[{"product_id": self.product.id, "quantity": 1}])

    def test_abono_parcial_deja_status_partially_paid(self):
        invoice, payment = charge_invoice(
            invoice_id=self.invoice.id, amount=Decimal("1000"), payment_method="CASH",
        )
        self.assertEqual(invoice.status, "PARTIALLY_PAID")
        self.assertEqual(invoice.amount_paid, Decimal("1000"))

    def test_pago_total_deja_status_paid(self):
        invoice, _ = charge_invoice(
            invoice_id=self.invoice.id, amount=self.invoice.total_amount, payment_method="CASH",
        )
        self.assertEqual(invoice.status, "PAID")

    def test_no_se_puede_cobrar_mas_del_saldo(self):
        with self.assertRaises(POSError):
            charge_invoice(
                invoice_id=self.invoice.id, amount=self.invoice.total_amount + 1, payment_method="CASH",
            )

    def test_cancelar_venta_mostrador_revierte_stock(self):
        cancel_invoice(invoice_id=self.invoice.id, reason="Cliente desistió")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 10)  # se devolvió el producto
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "CANCELLED")

    def test_no_se_puede_cobrar_factura_cancelada(self):
        cancel_invoice(invoice_id=self.invoice.id, reason="x")
        with self.assertRaises(POSError):
            charge_invoice(invoice_id=self.invoice.id, amount=Decimal("100"), payment_method="CASH")

    def test_no_se_puede_cancelar_factura_ya_pagada(self):
        charge_invoice(invoice_id=self.invoice.id, amount=self.invoice.total_amount, payment_method="CASH")
        with self.assertRaises(POSError):
            cancel_invoice(invoice_id=self.invoice.id, reason="tarde")


class POSWorkOrderFlowTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="cashier_wo", password="password")
        from finance.models import CashRegisterSession
        CashRegisterSession.objects.create(opened_by=self.user)
        self.client_obj = Client.objects.create(first_name="Carla", last_name="Ruiz", phone="+56933333333")
        self.vehicle = Vehicle.objects.create(
            license_plate="LMN345", make="Suzuki", model="Swift", year=2021, client=self.client_obj,
        )
        self.wo = WorkOrder.objects.create(vehicle=self.vehicle, mileage=30000, fuel_level=80)
        WorkOrderItem.objects.create(
            work_order=self.wo, description="Mano de obra diagnóstico",
            quantity=1, unit_price=Decimal("10000"), is_labor=True,
        )

    def test_buscar_ot_por_patente_crea_factura(self):
        invoice = get_or_create_invoice_for_work_order(self.wo)
        self.assertEqual(invoice.source, "WORK_ORDER")
        self.assertEqual(invoice.total_amount, Decimal("10000"))
        self.assertEqual(invoice.subtotal, Decimal("8403.36"))

    def test_cobrar_ot_existente(self):
        invoice = get_or_create_invoice_for_work_order(self.wo)
        invoice, payment = charge_invoice(
            invoice_id=invoice.id, amount=invoice.total_amount, payment_method="TRANSFER",
        )
        self.assertEqual(invoice.status, "PAID")

    def test_cancelar_ot_no_entregada(self):
        cancel_work_order(work_order=self.wo, reason="Cliente no autorizó presupuesto")
        self.wo.refresh_from_db()
        self.assertEqual(self.wo.status, "CANCELLED")

    def test_no_se_puede_cancelar_ot_entregada(self):
        self.wo.status = "DELIVERED"
        self.wo.save()
        with self.assertRaises(WorkOrderTransitionError):
            cancel_work_order(work_order=self.wo, reason="tarde")

    def test_pos_lookup_only_active_work_orders(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIClient
        
        user = User.objects.create_user(username="testuser", password="password")
        client = APIClient()
        client.force_authenticate(user=user)
        
        # Test delivered OT
        self.wo.status = "DELIVERED"
        self.wo.save()
        res = client.get(f"/api/finance/pos/work-order-lookup/?work_order_id={self.wo.id}")
        self.assertEqual(res.status_code, 404)
        
        # Test cancelled OT
        self.wo.status = "CANCELLED"
        self.wo.save()
        res2 = client.get(f"/api/finance/pos/work-order-lookup/?work_order_id={self.wo.id}")
        self.assertEqual(res2.status_code, 404)

        # Test active (IN_PROGRESS) OT
        self.wo.status = "IN_PROGRESS"
        self.wo.save()
        res3 = client.get(f"/api/finance/pos/work-order-lookup/?work_order_id={self.wo.id}")
        self.assertEqual(res3.status_code, 200)


class CashMovementOpenSessionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="cashier_mov", password="password")
        from rest_framework.test import APIClient
        self.client_api = APIClient()
        self.client_api.force_authenticate(user=self.user)

    def test_cash_movement_fails_when_session_closed(self):
        res = self.client_api.post('/api/finance/cash-movements/', {
            'movement_type': 'IN',
            'amount': 15000,
            'description': 'Ingreso extra'
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn("cerrada", str(res.data))

    def test_cash_movement_succeeds_when_session_open(self):
        from finance.models import CashRegisterSession
        session = CashRegisterSession.objects.create(opened_by=self.user, status='OPEN')

        res = self.client_api.post('/api/finance/cash-movements/', {
            'movement_type': 'IN',
            'amount': 15000,
            'description': 'Ingreso extra'
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['session'], session.id)



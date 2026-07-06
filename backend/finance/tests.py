from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from datetime import timedelta
from .models import Supplier, SupplierInvoice, SupplierPaymentDocument, CashMovement, CashRegisterSession

User = get_user_model()

class FinanceModuleTestCase(APITestCase):
    
    def setUp(self):
        # Create user
        self.user = User.objects.create_user(
            username='cajero1',
            email='cajero1@mecan.ia',
            password='testpassword'
        )
        self.client.login(username='cajero1', password='testpassword')
        
        # Create a test supplier
        self.supplier = Supplier.objects.create(
            rut="76.123.456-7",
            company_name="Repuestos Central SpA",
            email="contacto@repuestoscentral.cl",
            contact_name="Pedro Gomez",
            contact_phone="+56999999999"
        )
        
    def test_supplier_creation(self):
        # Test creating supplier via API
        payload = {
            "rut": "77.777.777-7",
            "company_name": "Neumaticos Sur Limitada",
            "email": "ventas@neumaticossur.cl",
            "contact_name": "Juan Perez",
            "contact_phone": "+56988888888"
        }
        res = self.client.post('/api/finance/suppliers/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Supplier.objects.filter(rut="77.777.777-7").count(), 1)

    def test_supplier_invoice_and_split_payment_forecast(self):
        # Test creating an invoice
        today = timezone.now().date()
        invoice = SupplierInvoice.objects.create(
            supplier=self.supplier,
            invoice_number="20340",
            total_amount=150000,
            subtotal=126050,
            tax_amount=23950,
            emission_date=today,
            due_date=today + timedelta(days=30),
            status="PENDING"
        )
        
        # Test adding split payment checks/documents
        doc1 = SupplierPaymentDocument.objects.create(
            invoice=invoice,
            document_type="CHEQUE",
            document_number="99812",
            amount=50000,
            payment_date=today + timedelta(days=1),
            status="PENDING"
        )
        doc2 = SupplierPaymentDocument.objects.create(
            invoice=invoice,
            document_type="CHEQUE",
            document_number="99813",
            amount=100000,
            payment_date=today + timedelta(days=1),
            status="PENDING"
        )
        
        # Test getting forecast
        res_forecast = self.client.get('/api/finance/supplier-payments/forecast/')
        self.assertEqual(res_forecast.status_code, status.HTTP_200_OK)
        # Check forecast items
        self.assertTrue(len(res_forecast.data) >= 1)
        
        # Test getting alerts (should return both due to <= 2 days threshold)
        res_alerts = self.client.get('/api/finance/supplier-payments/alerts/')
        self.assertEqual(res_alerts.status_code, status.HTTP_200_OK)
        # Verify document amounts match
        amounts = [float(item['amount']) for item in res_alerts.data]
        self.assertIn(50000, amounts)
        self.assertIn(100000, amounts)

    def test_cash_register_session_manual_movements(self):
        # 1. Open a cash session
        session = CashRegisterSession.objects.create(
            status='OPEN',
            opened_by=self.user,
            opening_amount=100000
        )
        
        # 2. Add an outflow cash movement (egreso)
        movement_egreso = CashMovement.objects.create(
            session=session,
            movement_type='OUT',
            amount=15000,
            description="Compra de cafe para clientes",
            registered_by=self.user,
            date=timezone.now()
        )
        
        # 3. Add an inflow cash movement (ingreso)
        movement_ingreso = CashMovement.objects.create(
            session=session,
            movement_type='IN',
            amount=30000,
            description="Reingreso caja chica",
            registered_by=self.user,
            date=timezone.now()
        )
        
        # Let's hit the cash register sessions endpoint
        res = self.client.get(f'/api/finance/cash-register/{session.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        # Verify stats totals computed dynamically inserializer
        self.assertEqual(float(res.data['total_inflow']), 30000.0)
        self.assertEqual(float(res.data['total_outflow']), 15000.0)

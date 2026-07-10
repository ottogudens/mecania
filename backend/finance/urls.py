from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    InvoiceViewSet,
    PaymentViewSet,
    POSWorkOrderLookupView,
    POSChargeView,
    POSCancelInvoiceView,
    POSCounterSaleView,
    InvoicePDFView,
    EstimateViewSet,
    CashRegisterViewSet,
    SupplierViewSet,
    SupplierInvoiceViewSet,
    SupplierPaymentDocumentViewSet,
    CashMovementViewSet,
    SupplierInvoiceParseUploadView,
    SupplierPaymentForecastView,
    SupplierPaymentAlertsView,
    FinanceResetView
)

router = DefaultRouter()
router.register(r'invoices', InvoiceViewSet)
router.register(r'payments', PaymentViewSet)
router.register(r'estimates', EstimateViewSet, basename='estimate')
router.register(r'cash-register', CashRegisterViewSet, basename='cash-register')
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'supplier-invoices', SupplierInvoiceViewSet, basename='supplier-invoice')
router.register(r'supplier-payments', SupplierPaymentDocumentViewSet, basename='supplier-payment')
router.register(r'cash-movements', CashMovementViewSet, basename='cash-movement')

urlpatterns = [
    path('pos/work-order-lookup/', POSWorkOrderLookupView.as_view(), name='pos-work-order-lookup'),
    path('pos/charge/', POSChargeView.as_view(), name='pos-charge'),
    path('pos/cancel-invoice/', POSCancelInvoiceView.as_view(), name='pos-cancel-invoice'),
    path('pos/counter-sale/', POSCounterSaleView.as_view(), name='pos-counter-sale'),
    path('reset/', FinanceResetView.as_view(), name='finance_reset'),
    path('invoices/<int:pk>/pdf/', InvoicePDFView.as_view(), name='invoice-pdf'),
    path('supplier-invoices/parse-upload/', SupplierInvoiceParseUploadView.as_view(), name='supplier-invoice-parse-upload'),
    path('supplier-payments/forecast/', SupplierPaymentForecastView.as_view(), name='supplier-payment-forecast'),
    path('supplier-payments/alerts/', SupplierPaymentAlertsView.as_view(), name='supplier-payment-alerts'),
    path('', include(router.urls)),
]

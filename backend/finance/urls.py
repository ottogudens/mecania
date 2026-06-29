from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    InvoiceViewSet,
    PaymentViewSet,
    POSWorkOrderLookupView,
    POSChargeView,
    POSCancelInvoiceView,
    POSCounterSaleView,
)

router = DefaultRouter()
router.register(r'invoices', InvoiceViewSet)
router.register(r'payments', PaymentViewSet)

urlpatterns = [
    path('pos/work-order-lookup/', POSWorkOrderLookupView.as_view(), name='pos-work-order-lookup'),
    path('pos/charge/', POSChargeView.as_view(), name='pos-charge'),
    path('pos/cancel-invoice/', POSCancelInvoiceView.as_view(), name='pos-cancel-invoice'),
    path('pos/counter-sale/', POSCounterSaleView.as_view(), name='pos-counter-sale'),
    path('', include(router.urls)),
]

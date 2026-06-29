from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    ProductViewSet,
    StockTransactionViewSet,
    ServiceViewSet,
    ServiceCategoryViewSet,
)

router = DefaultRouter()
router.register(r'products', ProductViewSet)
router.register(r'transactions', StockTransactionViewSet)
router.register(r'services', ServiceViewSet, basename='service')
router.register(r'service-categories', ServiceCategoryViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

from rest_framework import serializers, viewsets
from .models import Product, StockTransaction
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework.permissions import IsAuthenticated

class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = '__all__'

class StockTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockTransaction
        fields = '__all__'

class ProductViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Product.objects.all()
    serializer_class = ProductSerializer

class StockTransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = StockTransaction.objects.all()
    serializer_class = StockTransactionSerializer

router = DefaultRouter()
router.register(r'products', ProductViewSet)
router.register(r'transactions', StockTransactionViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

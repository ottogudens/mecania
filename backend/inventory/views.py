from rest_framework import serializers, viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Product, Service, ServiceCategory, StockTransaction


class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = ['id', 'name', 'description']


class ServiceSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Service
        fields = [
            'id', 'name', 'category', 'category_name', 'price',
            'description', 'is_active', 'created_at', 'updated_at',
        ]


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = '__all__'


class StockTransactionSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = StockTransaction
        fields = '__all__'


class ServiceCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = ServiceCategory.objects.all()
    serializer_class = ServiceCategorySerializer


class ServiceViewSet(viewsets.ModelViewSet):
    """
    Catálogo de servicios ofrecidos por el taller, con su categoría y valor.
    Se usa tanto para armar OTs como en la venta de mostrador del POS.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ServiceSerializer

    def get_queryset(self):
        qs = Service.objects.select_related('category').all()
        # Por defecto solo activos, salvo que se pida explícitamente todo
        # el histórico (útil en pantallas administrativas).
        if self.request.query_params.get('include_inactive') != 'true':
            qs = qs.filter(is_active=True)
        return qs


class ProductViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Product.objects.all()
    serializer_class = ProductSerializer


class StockTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Solo lectura: los movimientos de stock se generan siempre desde la
    lógica de negocio (cierre de OT, venta de mostrador, cancelación), nunca
    creados a mano vía API, para que el stock de Product nunca se desincronice
    de su historial de movimientos.
    """
    permission_classes = [IsAuthenticated]
    queryset = StockTransaction.objects.all().order_by('-created_at')
    serializer_class = StockTransactionSerializer

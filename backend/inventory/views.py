from rest_framework import serializers, viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Product, Service, ServiceCategory, StockTransaction, ServiceBundleItem


class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = ['id', 'name', 'description']


class ServiceBundleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_price = serializers.DecimalField(source='product.price', max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = ServiceBundleItem
        fields = ['id', 'product', 'product_name', 'product_price', 'quantity']


class ServiceSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    bundle_items = ServiceBundleItemSerializer(many=True, read_only=True)
    bundle_items_data = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    computed_bundle_price = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = [
            'id', 'name', 'category', 'category_name', 'price',
            'description', 'is_active', 'is_bundle', 'sales_count',
            'bundle_items', 'bundle_items_data', 'computed_bundle_price',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['sales_count']

    def get_computed_bundle_price(self, obj):
        """For bundle services, calculate the total price from bundle items."""
        if obj.is_bundle:
            total = sum(
                item.product.price * item.quantity
                for item in obj.bundle_items.select_related('product').all()
            )
            return float(total)
        return float(obj.price)

    def create(self, validated_data):
        bundle_items_data = validated_data.pop('bundle_items_data', [])
        service = super().create(validated_data)
        
        for item_data in bundle_items_data:
            ServiceBundleItem.objects.create(
                service=service,
                product_id=item_data['product_id'],
                quantity=item_data.get('quantity', 1)
            )
        
        # If it's a bundle, price might be dynamic, but for now we keep the base price 
        # or calculate it if needed based on frontend input.
        return service

    def update(self, instance, validated_data):
        bundle_items_data = validated_data.pop('bundle_items_data', None)
        service = super().update(instance, validated_data)

        if bundle_items_data is not None:
            service.bundle_items.all().delete()
            for item_data in bundle_items_data:
                ServiceBundleItem.objects.create(
                    service=service,
                    product_id=item_data['product_id'],
                    quantity=item_data.get('quantity', 1)
                )

        return service


class ProductSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = '__all__'
        read_only_fields = ['sales_count']

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None


class StockTransactionSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = StockTransaction
        fields = '__all__'


class ServiceCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = ServiceCategory.objects.all().order_by('name')
    serializer_class = ServiceCategorySerializer


class ServiceViewSet(viewsets.ModelViewSet):
    """
    Catálogo de servicios ofrecidos por el taller, con su categoría y valor.
    Se usa tanto para armar OTs como en la venta de mostrador del POS.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ServiceSerializer

    def get_queryset(self):
        qs = Service.objects.select_related('category').prefetch_related('bundle_items__product').all()
        # Por defecto solo activos, salvo que se pida explícitamente todo
        # el histórico (útil en pantallas administrativas).
        if self.request.query_params.get('include_inactive') != 'true':
            qs = qs.filter(is_active=True)
            
        # Optional sorting by sales
        if self.request.query_params.get('popular') == 'true':
            qs = qs.order_by('-sales_count', 'name')
            
        return qs


class ProductViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Product.objects.all().order_by('-id')
    serializer_class = ProductSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('popular') == 'true':
            qs = qs.order_by('-sales_count', '-id')
        return qs

    @action(detail=False, methods=['get'])
    def download_template(self, request):
        import pandas as pd
        import io
        from django.http import HttpResponse

        # Crear un DataFrame con las columnas esperadas
        df = pd.DataFrame(columns=['Tipo', 'SKU', 'Código de Barras', 'Nombre', 'Precio', 'Costo Neto', 'Stock', 'Proveedor', 'Categoría'])
        
        # Añadir algunos datos de ejemplo
        df.loc[0] = ['Producto', 'FILT-001', '7891000315507', 'Filtro de Aceite', 15000, 10000, 10, 'AutoParts SA', '']
        df.loc[1] = ['Servicio', '', '', 'Alineación', 20000, 0, '', '', 'Mantenimiento']

        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Plantilla')
            
            # Ajustar el ancho de las columnas
            worksheet = writer.sheets['Plantilla']
            for col in worksheet.columns:
                max_length = 0
                column = col[0].column_letter
                for cell in col:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(cell.value)
                    except:
                        pass
                adjusted_width = (max_length + 2)
                worksheet.column_dimensions[column].width = adjusted_width

        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = 'attachment; filename="plantilla_inventario.xlsx"'
        return response

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser])
    def bulk_upload(self, request):
        import pandas as pd
        
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se proporcionó ningún archivo.'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Leer excel (soporta .xls y .xlsx)
            df = pd.read_excel(file)
            
            # Limpiar nombres de columnas
            df.columns = df.columns.str.strip().str.lower()
            
            # Validar columnas requeridas
            required_cols = ['tipo', 'nombre', 'precio']
            for col in required_cols:
                if col not in df.columns:
                    return Response({'error': f'Columna requerida faltante: {col}'}, status=status.HTTP_400_BAD_REQUEST)
            
            products_created = 0
            services_created = 0
            errors = []
            
            for index, row in df.iterrows():
                tipo = str(row.get('tipo', '')).strip().lower()
                nombre = str(row.get('nombre', '')).strip()
                precio = row.get('precio', 0)
                
                if not nombre or str(nombre) == 'nan':
                    continue
                
                try:
                    if tipo == 'producto':
                        sku = str(row.get('sku', '')).strip()
                        barcode = str(row.get('código de barras', row.get('codigo de barras', ''))).strip()
                        if barcode == 'nan': barcode = ''
                        stock = int(row.get('stock', 0) if pd.notna(row.get('stock')) else 0)
                        cost_price = float(row.get('costo neto', 0) if pd.notna(row.get('costo neto')) else 0)
                        supplier = str(row.get('proveedor', '')).strip()
                        if supplier == 'nan': supplier = ''
                        
                        if not sku or sku == 'nan':
                            errors.append(f'Fila {index+2}: SKU vacío para producto "{nombre}".')
                            continue
                            
                        Product.objects.update_or_create(
                            sku=sku,
                            defaults={
                                'name': nombre, 
                                'price': precio, 
                                'stock_quantity': stock,
                                'barcode': barcode,
                                'cost_price': cost_price,
                                'supplier': supplier
                            }
                        )
                        products_created += 1
                    elif tipo == 'servicio':
                        categoria_str = str(row.get('categoría', row.get('categoria', 'General'))).strip()
                        if categoria_str == 'nan' or not categoria_str:
                            categoria_str = 'General'
                        categoria, _ = ServiceCategory.objects.get_or_create(name=categoria_str)
                        Service.objects.update_or_create(
                            name=nombre,
                            category=categoria,
                            defaults={'price': precio}
                        )
                        services_created += 1
                    else:
                        errors.append(f'Fila {index+2}: Tipo desconocido "{tipo}". Debe ser "Producto" o "Servicio".')
                except Exception as e:
                    errors.append(f'Fila {index+2}: Error al procesar "{nombre}": {str(e)}')
            
            return Response({
                'message': 'Carga completada',
                'products_created': products_created,
                'services_created': services_created,
                'errors': errors
            })
            
        except Exception as e:
            return Response({'error': f'Error al leer el archivo: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)



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

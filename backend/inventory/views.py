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
            'id', 'name', 'category', 'category_name', 'price', 'net_price',
            'description', 'is_active', 'is_bundle', 'sales_count',
            'bundle_items', 'bundle_items_data', 'computed_bundle_price',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['sales_count', 'net_price']

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

    @action(detail=False, methods=['get'])
    def download_service_template(self, request):
        import pandas as pd
        import io
        from django.http import HttpResponse

        columns = ['Nombre', 'Categoría', 'Precio', 'Descripción', 'Activo']
        rows = []

        # Exportar todos los servicios existentes
        for s in Service.objects.select_related('category').all().order_by('category__name', 'name'):
            rows.append([
                s.name,
                s.category.name if s.category else '',
                float(s.price),
                s.description or '',
                'Sí' if s.is_active else 'No',
            ])

        # Si no hay datos, agregar filas de ejemplo
        if not rows:
            rows.append(['Cambio de Aceite', 'Mantenimiento', 25000, 'Cambio de aceite y filtro', 'Sí'])
            rows.append(['Alineación y Balanceo', 'Suspensión', 35000, 'Alineación computarizada', 'Sí'])
            rows.append(['Diagnóstico Computarizado', 'Diagnóstico', 15000, 'Lectura de códigos OBD', 'Sí'])

        df = pd.DataFrame(rows, columns=columns)

        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Servicios')
            
            worksheet = writer.sheets['Servicios']
            for col in worksheet.columns:
                max_length = 0
                column = col[0].column_letter
                for cell in col:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = max(max_length + 2, 12)
                worksheet.column_dimensions[column].width = adjusted_width

        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = 'attachment; filename="plantilla_servicios.xlsx"'
        return response

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser])
    def bulk_upload_services(self, request):
        import pandas as pd

        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se proporcionó ningún archivo.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            df = pd.read_excel(file)
            df.columns = df.columns.str.strip().str.lower()

            # Validar columnas requeridas
            required_cols = ['nombre', 'precio']
            for col in required_cols:
                if col not in df.columns:
                    return Response({'error': f'Columna requerida faltante: {col}'}, status=status.HTTP_400_BAD_REQUEST)

            services_created = 0
            errors = []

            for index, row in df.iterrows():
                nombre = str(row.get('nombre', '')).strip()
                if not nombre or nombre == 'nan':
                    continue

                try:
                    precio = row.get('precio', 0)
                    if pd.isna(precio):
                        precio = 0

                    # Leer categoría - auto-crear si no existe
                    categoria_str = str(row.get('categoría', row.get('categoria', 'General'))).strip()
                    if categoria_str == 'nan' or not categoria_str:
                        categoria_str = 'General'
                    categoria, _ = ServiceCategory.objects.get_or_create(name=categoria_str)

                    # Leer descripción
                    descripcion = str(row.get('descripción', row.get('descripcion', ''))).strip()
                    if descripcion == 'nan':
                        descripcion = ''

                    # Leer estado activo
                    activo_str = str(row.get('activo', 'Sí')).strip().lower()
                    is_active = activo_str not in ('no', 'false', '0', 'inactivo')

                    Service.objects.update_or_create(
                        name=nombre,
                        category=categoria,
                        defaults={
                            'price': precio,
                            'description': descripcion,
                            'is_active': is_active,
                        }
                    )
                    services_created += 1
                except Exception as e:
                    errors.append(f'Fila {index+2}: Error al procesar "{nombre}": {str(e)}')

            return Response({
                'message': 'Carga completada',
                'services_created': services_created,
                'errors': errors
            })

        except Exception as e:
            return Response({'error': f'Error al leer el archivo: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


class ProductViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Product.objects.all().order_by('-id')
    serializer_class = ProductSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        barcode = self.request.query_params.get('barcode')
        if barcode:
            qs = qs.filter(barcode=barcode)
        if self.request.query_params.get('popular') == 'true':
            qs = qs.order_by('-sales_count', '-id')
        return qs

    @action(detail=False, methods=['get'])
    def download_template(self, request):
        import pandas as pd
        import io
        from django.http import HttpResponse

        columns = ['SKU', 'Código de Barras', 'Nombre', 'Categoría', 'Precio', 'Costo Neto', 'Stock', 'Proveedor']
        rows = []

        # Exportar todos los productos existentes
        for p in Product.objects.all().order_by('category', 'name'):
            rows.append([
                p.sku,
                p.barcode or '',
                p.name,
                p.category or '',
                float(p.price),
                float(p.cost_price),
                p.stock_quantity,
                p.supplier or '',
            ])

        # Si no hay datos, agregar filas de ejemplo
        if not rows:
            rows.append(['ACE-001', '7891000315507', 'Filtro de Aceite', 'Aceites', 15000, 10000, 10, 'AutoParts SA'])

        df = pd.DataFrame(rows, columns=columns)

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
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = max(max_length + 2, 12)
                worksheet.column_dimensions[column].width = adjusted_width

        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = 'attachment; filename="plantilla_inventario.xlsx"'
        return response

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser])
    def bulk_upload(self, request):
        import pandas as pd
        import re, unicodedata
        
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se proporcionó ningún archivo.'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Leer excel (soporta .xls y .xlsx)
            df = pd.read_excel(file)
            
            # Limpiar nombres de columnas
            df.columns = df.columns.str.strip().str.lower()
            
            # Validar columnas requeridas
            required_cols = ['nombre', 'precio']
            for col in required_cols:
                if col not in df.columns:
                    return Response({'error': f'Columna requerida faltante: {col}'}, status=status.HTTP_400_BAD_REQUEST)
            
            products_created = 0
            errors = []
            
            for index, row in df.iterrows():
                nombre = str(row.get('nombre', '')).strip()
                precio = row.get('precio', 0)
                
                if not nombre or str(nombre) == 'nan':
                    continue
                
                try:
                    sku = str(row.get('sku', '')).strip()
                    barcode = str(row.get('código de barras', row.get('codigo de barras', ''))).strip()
                    if not barcode or barcode == 'nan' or barcode.strip() == '':
                        barcode = None
                    else:
                        barcode = barcode.strip()
                    stock = int(row.get('stock', 0) if pd.notna(row.get('stock')) else 0)
                    cost_price = float(row.get('costo neto', 0) if pd.notna(row.get('costo neto')) else 0)
                    supplier = str(row.get('proveedor', '')).strip()
                    if supplier == 'nan': supplier = ''
                    categoria_prod = str(row.get('categoría', row.get('categoria', ''))).strip()
                    if categoria_prod == 'nan': categoria_prod = ''
                    
                    if not sku or sku == 'nan':
                        # Auto-generar SKU basado en la categoría del producto
                        source = categoria_prod if categoria_prod else nombre
                        normalized = unicodedata.normalize('NFKD', source).encode('ascii', 'ignore').decode('ascii')
                        # Tomar las primeras letras significativas como prefijo (3-4 chars)
                        words = re.sub(r'[^A-Za-z0-9\\s]', '', normalized).split()
                        if len(words) == 1:
                            prefix = words[0][:4].upper()
                        else:
                            # Tomar primeras letras de cada palabra (máx 4 palabras)
                            prefix = ''.join(w[0] for w in words[:4]).upper()
                        if not prefix:
                            prefix = 'PROD'
                        
                        # Buscar el siguiente número secuencial para este prefijo
                        existing = Product.objects.filter(sku__startswith=f'{prefix}-').order_by('-sku')
                        max_num = 0
                        for p in existing:
                            try:
                                num = int(p.sku.split('-')[-1])
                                if num > max_num:
                                    max_num = num
                            except (ValueError, IndexError):
                                pass
                        sku = f'{prefix}-{str(max_num + 1).zfill(3)}'
                        
                        # Asegurar unicidad por si acaso
                        while Product.objects.filter(sku=sku).exists():
                            max_num += 1
                            sku = f'{prefix}-{str(max_num + 1).zfill(3)}'
                        
                    # Si existe otro producto con el mismo barcode (no vacío/nulo), arrojar error descriptivo
                    if barcode:
                        duplicate_barcode_prod = Product.objects.filter(barcode=barcode).exclude(sku=sku).first()
                        if duplicate_barcode_prod:
                            errors.append(f'Fila {index+2}: El código de barras "{barcode}" ya está en uso por el producto "{duplicate_barcode_prod.name}" (SKU: {duplicate_barcode_prod.sku}).')
                            continue

                    Product.objects.update_or_create(
                        sku=sku,
                        defaults={
                            'name': nombre, 
                            'price': precio, 
                            'stock_quantity': stock,
                            'barcode': barcode,
                            'cost_price': cost_price,
                            'supplier': supplier,
                            'category': categoria_prod,
                        }
                    )
                    products_created += 1
                except Exception as e:
                    errors.append(f'Fila {index+2}: Error al procesar "{nombre}": {str(e)}')
            
            return Response({
                'message': 'Carga completada',
                'products_created': products_created,
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

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClientViewSet, VehicleViewSet, WorkOrderViewSet, 
    WorkOrderItemViewSet, VisualInspectionViewSet, 
    CustomAuthToken, ClientAuthToken, ClientDataView
)

router = DefaultRouter()
router.register(r'clients', ClientViewSet)
router.register(r'vehicles', VehicleViewSet)
router.register(r'work-orders', WorkOrderViewSet)
router.register(r'work-order-items', WorkOrderItemViewSet)
router.register(r'inspections', VisualInspectionViewSet)

urlpatterns = [
    path('login/', CustomAuthToken.as_view(), name='api_login'),
    path('client/login/', ClientAuthToken.as_view(), name='client_login'),
    path('client/data/', ClientDataView.as_view(), name='client_data'),
    path('', include(router.urls)),
]

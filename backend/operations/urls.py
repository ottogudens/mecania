from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VehicleViewSet, WorkOrderViewSet, VisualInspectionViewSet

router = DefaultRouter()
router.register(r'vehicles', VehicleViewSet)
router.register(r'work-orders', WorkOrderViewSet)
router.register(r'inspections', VisualInspectionViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

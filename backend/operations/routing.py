from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/work_orders/$', consumers.WorkOrderConsumer.as_asgi()),
]

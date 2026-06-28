import json
from channels.generic.websocket import AsyncWebsocketConsumer

class WorkOrderConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.group_name = 'work_orders'

        # Join room group
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )

    # Receive message from room group
    async def work_order_updated(self, event):
        message = event['message']
        work_order_id = event['work_order_id']

        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'work_order_updated',
            'work_order_id': work_order_id,
            'message': message
        }))

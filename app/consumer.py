# Channel views websocket
# Untuk receive & request

import json
from channels.generic.websocket import WebsocketConsumer

class FileUploadConsumer(WebsocketConsumer):
    async def connect(self):
        try:
            self.group_name = self.scope['url_route']['kwargs']['group_name']
            print(f"WebSocket CONNECT attempt for group: {self.group_name}")
            
            # Menerima koneksi
            await self.accept()
            print(f"WebSocket ACCEPTED for group: {self.group_name}")
            
            # Menambahkan ke group
            await self.channel_layer.group_add(
                self.group_name,
                self.channel_name
            )
            print(f"Added to group: {self.group_name}")
            
        except Exception as e:
            print(f"WebSocket CONNECT error: {str(e)}")
            await self.close()

    async def disconnect(self, code):
        print(f"WebSocket DISCONNECTED for group: {self.group_name}, code: {code}")
        try:
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )
        except Exception as e:
            print(f"WebSocket DISCONNECT error: {str(e)}")

    # Menerima pesan worker dan diteruskan ke frontend
    async def upload_berhasil(self, event):
        try:
            print(f"Sending notification to group: {self.group_name}")
            await self.send(text_data=json.dumps({
                'type': 'notification',
                'message': event['message']
            }))
        except Exception as e:
            print(f"Error sending notification: {str(e)}")
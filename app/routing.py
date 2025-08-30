from django.urls import re_path
from . import consumer

websocket_urlpatterns = [
    re_path(r'ws/upload/(?P<group_name>[\w-]+)/$', consumer.FileUploadConsumer.as_asgi())
]
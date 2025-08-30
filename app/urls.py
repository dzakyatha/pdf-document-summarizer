from django.urls import path
from .views import UploadFileView, HomeView

urlpatterns = [
    path('', HomeView.as_view(), name='home'),
    path('api/chunk-upload/', UploadFileView.as_view(), name='chunk-upload'),
]
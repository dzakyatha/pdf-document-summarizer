from django.http import JsonResponse
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.views.generic import TemplateView
import django_rq
from .tasks import process_chunk

class HomeView(TemplateView):
    template_name = 'index.html'

@method_decorator(csrf_exempt, name='dispatch')
class UploadFileView(View):
    def post(self, request, *args, **kwargs):
        # Ambil file chunk dan metadata dari request
        file_chunk = request.FILES.get('chunk')

        # Ambil nama file dari FormData
        original_filename = request.POST.get('filename')
        chunk_index = int(request.POST.get('chunk_index'))
        total_chunks = int(request.POST.get('total_chunks'))
        group_name = request.POST.get('group_name')
        
        # Log penerimaan chunk
        print(f"Received chunk for {original_filename} (index: {chunk_index}/{total_chunks-1}) with group_name: {group_name}")

        # Membaca isi chunk
        chunk_data = file_chunk.read()

        # Mendapatkan queue default
        queue = django_rq.get_queue('default')

        # Memasukkan task ke queue
        # Mengirim data biner dan semua metadata yang diperlukan task
        queue.enqueue(
            process_chunk,
            chunk_data,
            original_filename,
            chunk_index,
            total_chunks,
            group_name
        )
        
        return JsonResponse({'message':f'Chunk {chunk_index} telah diterima dan dimasukkan ke queue'}, status=202) # 202 = Accepted
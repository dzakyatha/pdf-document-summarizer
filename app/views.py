from django.shortcuts import render
from django.http import JsonResponse
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.views.generic import TemplateView

# Create your views here.
class HomeView(TemplateView):
    template_name = 'chunkApp/index.html'

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
        
        return JsonResponse({'message':f'Chunk {chunk_index} telah diterima dan dimasukkan ke queue'}, status=202) # 202 = Accepted
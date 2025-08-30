import os, django, shutil, redis, json
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

# Fungsi untuk memproses chunk file
def process_chunk(chunk_data, original_filename, chunk_index, total_chunks, group_name):
    # Menyimpan chunk di direktori sementara
    temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp', original_filename)
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, f"{chunk_index}.part")
    with open(temp_file_path, 'wb+') as temp_file:
        temp_file.write(chunk_data)

    # Menggabungkan chunk
    if chunk_index == total_chunks - 1:
        final_file_path = os.path.join(settings.MEDIA_ROOT, 'uploads', original_filename)
        os.makedirs(os.path.dirname(final_file_path), exist_ok=True)
        with open(final_file_path, 'wb+') as final_file:
            for i in range(total_chunks):
                part_path = os.path.join(temp_dir, f"{i}.part")
                with open(part_path, 'rb') as part_file:
                    final_file.write(part_file.read())
        shutil.rmtree(temp_dir)
        
        
        print(f"File {original_filename} selesai diupload")
        r = redis.Redis(
            host='localhost', 
            port=6379, 
            db=0
        )
        final_file_url = os.path.join(settings.MEDIA_URL, 'uploads', original_filename).replace("\\", "/")
        
        payload = {
            'group_name': group_name, # Untuk routing di server websocket
            'payload': {              # Isi pesan untuk frontend
                'status': 'success',
                'file_url': final_file_url,
                'filename': original_filename,
            }
        }
        
        # Publikasi pesan ke channel "upload_notifications"
        r.publish("upload_notifications", json.dumps(payload))
        print("Pesan berhasil dipublikasikan")
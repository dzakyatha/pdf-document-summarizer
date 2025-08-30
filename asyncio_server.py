import asyncio, websockets, json, redis.asyncio as redis
import httpx, pdfplumber, io

# Variabel untuk menyimpan koneksi yang aktif
# Format: {'group_name': websocket_connection}
CONNECTED_CLIENTS = {}

# Channel Redis
REDIS_CHANNEL = "upload_notifications"

# Inisialisasi Koneksi Redis
redis_client = redis.Redis(
        host='localhost',
        port=6379, # port TCP Redis,
        db=0,
        decode_responses=True
    )

# URL API Ollama di server remote
OLLAMA_API_URL = "http://10.0.8.230:11434/api/generate/" 

# Nama model Ollama
MODEL_NAME = "gemma3:latest"

# Fungsi meringkas file PDF dengan model Ollama
async def summarize_file(file_path):
    try:
        with open(file_path, "rb") as f:
            pdf_bytes = io.BytesIO(f.read())

        full_text_content = []
        with pdfplumber.open(pdf_bytes) as pdf:
            all_pages = pdf.pages
            
            # Memulai ekstrak dari Bab IV
            start_keyword = "BAB IV"
            start_page_index = 0
            end_page_index = len(all_pages)

            # Mencari halaman tempat Bab IV muncul
            for i, page in enumerate(all_pages):
                text = page.extract_text()
                if text and start_keyword in text:
                    start_page_index = i
                    break
            
            relevant_pages = all_pages[start_page_index:end_page_index]
            print(f"Mengekstrak konten dari halaman {start_page_index + 1} hingga {end_page_index}.")

            # Mengekstrak teks dan tabel dari halaman yang relevan
            for page in relevant_pages:
                text = page.extract_text()
                if text:
                    full_text_content.append(text)

                tables = page.extract_tables()
                if tables:
                    full_text_content.append("\n--- DATA TABEL ---\n")
                    for table in tables:
                        for row in table:
                            cleaned_row = [str(cell) if cell is not None else "" for cell in row]
                            full_text_content.append(" | ".join(cleaned_row))
                        full_text_content.append("--- AKHIR DATA TABEL ---\n")
        
        full_text = "\n".join(full_text_content)
        print(f"Mengirim teks ke model Ollama...")
    
        prompt = f"""Di bawah ini adalah teks dari sebuah dokumen:

        {full_text}

        ---

        Tugas Anda adalah membuat ringkasan terstruktur dari dokumen tersebut

        Ringkasan:"""
        
        payload = {
            "model": MODEL_NAME, 
            "prompt": prompt, 
            "stream": False}

        # Mengirim request ke API Ollama untuk mendapatkan ringkasan
        async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as client:
            response = await client.post(OLLAMA_API_URL, json=payload)
            response.raise_for_status()
            summary_file = response.json().get('response', 'Gagal mendapat ringkasan.')
        
        print("Ringkasan berhasil dibuat.")
        return summary_file

    except httpx.HTTPStatusError as e:
        error_message = f"Error HTTP dari Ollama: {e.response.status_code} - {e.response.text}"
        print(error_message)
        return error_message
    except Exception as e:
        error_message = f"Error saat memproses dengan Ollama: {type(e).__name__} - {e}"
        print(error_message)
        return error_message


# Fungsi untuk listener dari Redis
async def listener():
    async with redis_client.pubsub() as pubsub:
        await pubsub.subscribe(REDIS_CHANNEL)
        while True:
            try:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message:
                    data = json.loads(message['data'])
                    group_name = data.get('group_name')
                    file_path = data.get('file_path')
                    filename = data.get('filename')
                    
                    if file_path is None:
                        print("Error: Pesan dari Redis tidak berisi 'file_path'")
                        continue
                    
                    summary = await summarize_file(file_path)
                    websocket = CONNECTED_CLIENTS.get(group_name)
                    if websocket:
                        print(f"Meneruskan pesan ke browser dengan grup: {group_name}")
                        payload = {'status': 'success', 'summary': summary, 'filename': filename}
                        await websocket.send(json.dumps({'message': payload}))
            except Exception as e:
                print(f"Error dari listener: {e}")

# Fungsi untuk menangani setiap koneksi WebSocket
async def handler(websocket):
    path = websocket.path
    group_name = path.strip('/')
    CONNECTED_CLIENTS[group_name] = websocket
    print(f"{group_name} connected")
    print(f"Total client: {len(CONNECTED_CLIENTS)}")

    try:
        # Koneksi terbuka terus-menerus
        async for message in websocket:
            pass
    finally:
        # Menghapus koneksi saat browser ditutup
        del CONNECTED_CLIENTS[group_name]
        print(f"{group_name} disconnected")
        print(f"Total client: {len(CONNECTED_CLIENTS)}")


# Fungsi utama untuk menjalankan server
async def main():
    print("Memulai server websocket di port 9000")

    # Listener Redis
    listener_task = asyncio.create_task(listener())

    # Server WebSocket
    async with websockets.serve(handler, "localhost", 9000):
        await listener_task

if __name__ == "__main__":
    asyncio.run(main())
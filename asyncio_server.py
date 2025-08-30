# Skrip server asyncio

import asyncio, websockets, json
import httpx, pdfplumber, redis.asyncio as redis

# Konfigurasi Server Redis
CONNECTED_CLIENTS = {}
REDIS_CHANNEL = "upload_notifications"
redis_client = redis.Redis(
    host='localhost', 
    port=6379, 
    db=0, 
    decode_responses=True
)

# Konfigurasi API Ollama dan model di server remote
OLLAMA_API_URL = "http://10.0.8.230:11434/api/generate" 
MODEL_NAME = "gemma_summarizer_v3.3:latest" 

# Template prompt untuk model
# Prompt yang sama saat fine-tuning dan tanpa bagian jawaban
prompt_template_inference = """Berikut adalah teks dari dokumen evaluasi tentara yang mencakup bab inti yaitu Analisa dan Evaluasi, serta Kesimpulan dan Saran. Tugas Anda adalah menganalisis teks di atas untuk membuat ringkasan yang komprehensif dan terstruktur dalam Bahasa Indonesia. Ikuti instruksi berikut secara ketat untuk menyusun ringkasan:

1.  **Analisa dan Evaluasi:**
* Ringkas temuan utama dari analisis dan evaluasi yang dilakukan terhadap operasi secara terurut.
* Sajikan poin-poin penting dari bagian ini dalam bentuk daftar. 
* Hindari penggunaan kata/kalimat yang negatif.

2.  **Kesimpulan dan Saran:**
* Mulai dengan satu paragraf ringkasan yang mencakup kesimpulan utama dari evaluasi.
* Setelah kesimpulan, sajikan semua saran yang diajukan dalam dokumen dalam bentuk daftar bernomor. 
* Jangan menampilkan saran yang anda asumsikan/buat sendiri.

---

### Dokumen:
{}

### Jawaban:
"""

# Kata kunci pencarian bab
START_KEYWORDS = [
    "BAB III\nANALISA DAN EVALUASI",
    "BAB IV\nANALISA DAN EVALUASI", 
    "BAB-IV\nANALISA DAN EVALUASI", 
    "BAB IV\nEVALUASI", 
    "BAB IV\nANALISA EVALUASI",
    "BAB IV\nANALISIS DAN EVALUASI"
    ]

END_KEYWORDS = [
    "BAB VI\nPENUTUP",
    "BAB-VI\nPENUTUP",
    "BAB V\nPENUTUP"
    ]

# Fungsi menemukan halaman di mana kata kunci muncul di dokumen
def find_start_page(pdf_path, keyword):
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text and keyword.lower() in text.lower():
                    print(f"  > Kata kunci '{keyword}' ditemukan di halaman {i + 1}.")
                    return i
        print(f"  > Kata kunci '{keyword}' tidak ditemukan.")
        return None
    except Exception as e:
        print(f"    ! Error saat mencari halaman awal: {e}")
        return None

# Fungsi ekstrak teks dari PDF
def extract_chapter_text(pdf_path, start_keyword_list, end_keyword):
    try:
        with pdfplumber.open(pdf_path) as pdf:
            start_keyword = None
            for keyword in start_keyword_list:
                start_page_index = find_start_page(pdf_path, keyword)
                if start_page_index:
                    start_keyword = keyword
                    break

            if start_page_index is None:
                return None

            # Gabungkan teks dari halaman awal hingga akhir dokumen
            full_text_from_start = ""
            for i in range(start_page_index, len(pdf.pages)):
                text = pdf.pages[i].extract_text(x_tolerance=2)
                if text:
                    full_text_from_start += text + "\n\n"
            
            # PEMOTONGAN BERBASIS TEKS (AKURAT) ---
            start_pos = full_text_from_start.lower().find(start_keyword.lower())
            end_pos = full_text_from_start.lower().find(end_keyword.lower(), start_pos)

            chapter_text = full_text_from_start[start_pos:]
            
            if end_pos != -1:
                relative_end_pos = end_pos - start_pos
                chapter_text = chapter_text[:relative_end_pos]
            
            return chapter_text

    except Exception as e:
        print(f"    ! Gagal mengekstrak teks: {e}")
        return None
    
# Fungsi membuat prompt dan ditampilkan ke web
def initialize_prompt(file_path):
    try:
        full_text = extract_chapter_text(file_path, START_KEYWORDS, "BAB VI")
        if not full_text:
            return None, "Dokumen tidak berisi teks yang dapat dibaca."

        # Membuat template prompt awal
        prompt = prompt_template_inference.format(full_text.strip())
        return full_text, prompt
    
    except Exception as e:
        print(f"Error saat membuat prompt awal: {e}")
        return None, f"Gagal mengekstrak teks dari file: {e}"

# Fungsi mengirimkan prompt ke model
async def summarize_file(final_prompt):
    try:
        payload = {
            "model": MODEL_NAME, 
            "prompt": final_prompt, 
            "stream": False
        }

        print(f"Mengirim teks ke model Ollama: {MODEL_NAME}...")
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(OLLAMA_API_URL, json=payload)
            response.raise_for_status()
            return response.json().get('response', 'Gagal mendapat ringkasan.')

    except Exception as e:
        return f"Error saat memproses dengan Ollama: {e}"

# Fungsi untuk menerima file dari Redis, memanggil fungsi meringkas file, dan meneruskan hasil ringkasan ke browser
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

                    # Mengirim prompt awal ke browser
                    original_text, initial_prompt = initialize_prompt(file_path)
                    websocket = CONNECTED_CLIENTS.get(group_name)

                    if websocket:
                        payload = {
                            'type': 'prompt_ready', # Tipe pesan baru
                            'prompt': initial_prompt,
                            'filename': filename
                        }

                        await websocket.send(json.dumps({"message": payload}))

            except Exception as e:
                print(f"Error dari listener: {e}")

# Fungsi untuk menangani koneksi websocket
async def handler(websocket, path):
    group_name = path.strip('/')
    CONNECTED_CLIENTS[group_name] = websocket
    print(f"{group_name} terhubung. Total klien: {len(CONNECTED_CLIENTS)}")
    try:
        async for message in websocket:
            data = json.loads(message)
            
            # Browser mengirim kembali prompt final
            if data.get('type') == 'execute_summarization':
                final_prompt = data.get('prompt')
                filename = data.get('filename')
                
                # Eksekusi dan kirim hasil akhir
                summary = await summarize_file(final_prompt)
                
                # Kirim hasil ringkasan kembali ke browser
                payload = {
                    'type': 'summary_complete', # Tipe pesan baru
                    'summary': summary.replace('**', '').replace('*', '-'),
                    'filename': filename
                }
                await websocket.send(json.dumps({"message": payload}))
    finally:
        del CONNECTED_CLIENTS[group_name]
        print(f"{group_name} terputus. Total klien: {len(CONNECTED_CLIENTS)}")

# Fungsi utama
async def main():
    print("Memulai server websocket di port 9000")
    listener_task = asyncio.create_task(listener())
    async with websockets.serve(handler, "localhost", 9000):
        await listener_task

if __name__ == "__main__":
    asyncio.run(main())
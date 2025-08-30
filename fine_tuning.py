# Skrip untuk fine-tuning model

import torch
from unsloth import FastLanguageModel
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments, AutoTokenizer
from unsloth.chat_templates import get_chat_template
from transformers import EarlyStoppingCallback

# Prompt template fine tuning model
prompt_template = """Berikut adalah teks dari dokumen evaluasi tentara yang mencakup bab inti yaitu Analisa dan Evaluasi, serta Kesimpulan dan Saran. Tugas Anda adalah menganalisis teks di atas untuk membuat ringkasan yang komprehensif dan terstruktur dalam Bahasa Indonesia. Ikuti instruksi berikut secara ketat untuk menyusun ringkasan:
1.  **Analisa dan Evaluasi:**
* Ringkas temuan utama dari analisis dan evaluasi yang dilakukan terhadap operasi.
* Fokus pada kekuatan, kelemahan, peluang, dan tantangan yang diidentifikasi dalam dokumen. Jika aspek-aspek tersebut tidak teridentifikasi secara eksplisit pada dokumen maka abaikan saja.
* Sajikan poin-poin penting dari bagian ini dalam bentuk daftar. Hindari penggunaan kata/kalimat yang negatif.

2.  **Kesimpulan dan Saran:**
* Mulai dengan satu paragraf ringkasan yang mencakup kesimpulan utama dari evaluasi.
* Setelah kesimpulan, sajikan semua saran yang diajukan dalam dokumen dalam bentuk daftar bernomor. 
* Jangan membuat/mengasumsikan saran sendiri.

---

### Dokumen:
{}

### Ringkasan:
{}"""
# ------------------------------------

EOS_TOKEN = "<|end_of_text|>"

def format_prompt(example):
    """Fungsi untuk memformat setiap baris data menjadi prompt lengkap."""
    formatted_string = prompt_template.format(
        example["text"],
        example["summary"],
    ) + EOS_TOKEN

    return [formatted_string]

def main():
    # Model dari Unsloth yang akan di fine-tuning
    model_name = "unsloth/gemma-3-4b-it"
    model, _ = FastLanguageModel.from_pretrained(
        model_name = model_name,
        max_seq_length = 4096,
        dtype = None,
        load_in_4bit = True,
    )

    # Tambahkan adapter LoRA
    model = FastLanguageModel.get_peft_model(
        model,
        r = 8,
        target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                          "gate_proj", "up_proj", "down_proj"],
        lora_alpha = 8,
        lora_dropout = 0,
        bias = "none",
        use_gradient_checkpointing = True,
        random_state = 42,
    )

    # Muat tokenizer model
    tokenizer = AutoTokenizer.from_pretrained("unsloth/gemma-3-4b-it")
    tokenizer = get_chat_template(
        tokenizer,
        chat_template = "gemma-3",
    )

    # Path Dataset
    dataset_files = [
        'dataset/dataset_fix.jsonl',
        'dataset/dataset2_fix.jsonl'
       ]
    
    train_dataset = load_dataset("json", data_files=dataset_files, split="train")

    # Inisialisasi trainer
    trainer = SFTTrainer(
        model = model,
        tokenizer = tokenizer,
        train_dataset = train_dataset,
        formatting_func = format_prompt,
        args = TrainingArguments(
            per_device_train_batch_size = 2,
            gradient_accumulation_steps = 4,
            warmup_steps = 5,
            num_train_epochs = 2,
            learning_rate = 2e-5,
            fp16 = not torch.cuda.is_bf16_supported(),
            bf16 = torch.cuda.is_bf16_supported(),
            logging_steps = 1,
            optim = "adamw_8bit",
            weight_decay = 0.01,
            lr_scheduler_type = "linear",
            seed = 42,
            output_dir = "outputs",
        ),
    )

    print("Memulai proses fine-tuning...")
    trainer.train()

    # Gabungkan adapter LoRA dengan model
    model.save_pretrained_merged("gemma_summarizer_v3.3", tokenizer)

    # Simpan model dalam format GGUF
    model.save_pretrained_gguf(
        "gemma_summarizer_v3.3",
        quantization_type = "Q8_0",
    )

    print("Fine-tuning selesai! Model tersimpan di folder 'gemma_summarizer_v3.3'")

if __name__ == "__main__":
    main()

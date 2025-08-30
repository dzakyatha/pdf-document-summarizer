// Ambil elemen dari DOM
document.addEventListener('DOMContentLoaded', ()=> {

    const generateButton = document.getElementById('generate-upload-slots');
    const totalFilesInput = document.getElementById('total-input-files');
    const slotsContainer = document.getElementById('upload-slots-container');
    const uploadForm = document.getElementById('upload-form');
    const uploadBtn = document.getElementById('upload-btn');
    
    // fungsi untuk generate slot upload
    function createUploadSlots(){
        const totalSlots = parseInt(totalFilesInput.value, 10);
        console.log(`Total slots yang akan dibuat: ${totalSlots}`); // DEBUG
        slotsContainer.innerHTML = '';

        if (totalSlots > 0) {
            for (let i = 1; i <= totalSlots; i++){
                const slotHTML = `
                    <div class="upload-slot" id="slot-container-${i}">
                        <div class="upload-slot-header">File ${i}</div>
                        <input type="file" id="file-input-${i}" class="file-input">
                        <div id="progress-container-${i}" style="display: none; margin-top: 10px;">
                            <p id="filename-${i}" style="margin-bottom: 5px;color: #edf0f3;"></p>
                            <progress id="progress-${i}" value="0" max="100" style="width: 100%;"></progress>
                            <div id="preview-${i}" style="margin-top: 10px;"></div>
                        </div>
                        <style>
                            .upload-slot-header {
                                font-weight: 500;
                                color: #edf0f3;
                                margin-bottom: 10px;
                            }
                            .upload-slot input[type="file"] {
                                margin-top: 10px;
                                color: #edf0f3;
                            }
                            .btn-primary {
                                background-color: #1a73e8;
                                color: rgb(242, 242, 247);
                                width: 100%;
                                font-size: 1.1rem;
                                padding: 12px;
                            }
                        </style>
                    </div>
                `;
                slotsContainer.insertAdjacentHTML('beforeend', slotHTML);
            }
            uploadBtn.style.display = 'block'; // menampilkan tombol upload
        } else {
            uploadBtn.style.display = 'none'; // jika tidak ada slot
        }
    }

    // event listener tombol generate slot upload
    generateButton.addEventListener('click', createUploadSlots);


    // fungsi upload
    async function uploadFile(file, uiHooks, groupName) {
        const CHUNK_SIZE = 512 * 512; // 500KB per chunk
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        uiHooks.container.style.display = 'block';
        uiHooks.filename.textContent = file.name;

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++){
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end)

            // Buat objek FormData
            const formData = new FormData();
            formData.append('chunk', chunk, file.name); // kirim chunk
            formData.append('filename', file.name); // nama file
            formData.append('chunk_index', chunkIndex); // nomor chunk
            formData.append('total_chunks', totalChunks); // total chunk 
            formData.append('group_name', groupName);
            console.log(`[${file.name}] mengirim chunk ${chunkIndex} dengan group_name: ${groupName}`); // DEBUG

            try {
                const response = await fetch('/api/chunk-upload/', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error(`Server error pada chunk ${chunkIndex}`);
                }
                console.log(`Uploading chunk ${chunkIndex} with group: ${groupName}`);
            } catch (error) {
                console.error(`Upload chunk ${chunkIndex} untuk file ${file.name} error:`, error);
                uiHooks.filename.textContent = `Error: ${error.message}`;
                return; // proses berhenti jika ada error
            }

            uiHooks.progressBar.value = ((chunkIndex + 1) / totalChunks) * 100;
        }
    }

    // Event listener form
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // ID unik sesi sebelum upload dimulai
        const groupName = 'session-' + Math.random().toString(36).substring(2, 9);

        // koneksi websocket
        const socket = new WebSocket(`ws://127.0.0.1:9000/${groupName}/`);
        console.log("GroupName:", groupName);  // debugging

        socket.onopen = (e) => console.log("Koneksi WebSocket berhasil dibuka");
        socket.onclose = (e) => console.error("Koneksi WebSocket ditutup");

        // untuk preview pdf setelah menerima pesan websocket
        socket.onmessage = (e) => {
            const data = JSON.parse(e.data).message;
            console.log("Pesan diterima:", data);
            
            if (data.status === 'success') {
                const cleanFileName = data.filename.replace(/[^a-zA-Z0-9_-]/g, '');
                const previewElement = document.getElementById(`preview-${cleanFileName}`);
                if (previewElement) {
                    displayPreview(data.file_url, previewElement);
                }
            }
        };
        
        const allFileInputs = document.querySelectorAll('.file-input');
        const fileToUpload = [];
        allFileInputs.forEach((input, index) => {
            if (input.files.length > 0){
                const file = input.files[0];
                const slotNumber = input.id.split('-')[2];
                const cleanFileName = file.name.replace(/[\. ]/g, '');
                
                const container = document.getElementById(`progress-container-${slotNumber}`);
            
            
                const progressBar = container.querySelector('progress');
                progressBar.id = `progress-${cleanFileName}`;
                
                const previewDiv = container.querySelector('div');
                previewDiv.id = `preview-${cleanFileName}`;
                
                fileToUpload.push({
                    file: file,
                    uiHooks: {
                        container: container,
                        filename: document.getElementById(`filename-${slotNumber}`),
                        progressBar: progressBar, // Gunakan variabel yang sudah kita ambil
                        preview: previewDiv,      // Gunakan variabel yang sudah kita ambil
                    }
                });

                /*const container = document.getElementById(`progress-container-${index + 1}`);
                if (container) { // Add this check
                    container.querySelector('progress').id = `progress-${cleanFileName}`;
                    container.querySelector('div').id = `preview-${cleanFileName}`;
                } else {
                    console.error(`Element with ID 'progress-container-${index + 1}' not found.`); // Optional: Log a message
                }*/

            }
        });

        if (fileToUpload.length === 0) {
            alert("Pilih setidaknya satu file.");
            return;
        }

        const uploadPromises = fileToUpload.map(item => uploadFile(item.file, item.uiHooks, groupName));
        
        try {
            await Promise.all(uploadPromises);
            console.log("Semua file telah selesai dikirim ke queue");
        } catch (error) {
            console.error("Terjadi error saat proses upload:", error);
        }
    });


    // fungsi preview pdf
    function displayPreview(fileUrl, previewElement) {
        console.log("URL yang diterima untuk preview:", fileUrl);
        const extension = fileUrl.split('.').pop().toLowerCase();
        previewElement.innerHTML = `<embed src="${fileUrl}" type="application/pdf" width="100%" height="500px" />`;
    }

    createUploadSlots();

});
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const progressPreviewArea = document.getElementById('progress-preview-area');

    let filesToUpload = [];

    // Mencegah browser membuka file saat di-drag
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    // Menangani file baru dari drag & drop
    function handleFiles(newFiles) {
        progressPreviewArea.innerHTML = '';
        for (const file of newFiles) {
            if (!filesToUpload.some(f => f.name === file.name && f.size === file.size)) {
                filesToUpload.push(file);
            }
        }
        updateFileListUI();
    }

    // Menampilkan daftar file dan progress bar awal
    function updateFileListUI() {
        progressPreviewArea.innerHTML = '';
        if (filesToUpload.length > 0) {
            filesToUpload.forEach((file, index) => {
                const cleanFileName = file.name.replace(/[^a-zA-Z0-9_-]/g, '');
                const fileItemHTML = `
                    <div class="progress-item" id="item-${cleanFileName}">
                        <div class="file-info">
                            <span>${file.name}</span>
                            <button type="button" class="remove-file-btn" data-index="${index}">&times;</button>
                        </div>
                        <progress id="progress-${cleanFileName}" value="0" max="100"></progress>
                        <div id="preview-${cleanFileName}"></div>
                    </div>
                `;
                progressPreviewArea.insertAdjacentHTML('beforeend', fileItemHTML);
            });
            uploadBtn.style.display = 'block';
        } else {
            uploadBtn.style.display = 'none';
        }
    }

    // Event listeners untuk drop zone
    dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    // Event listener untuk menghapus file dari daftar
    progressPreviewArea.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-file-btn')) {
            const indexToRemove = parseInt(e.target.dataset.index, 10);
            filesToUpload.splice(indexToRemove, 1);
            updateFileListUI();
        }
    });
    
    // Event listener untuk tombol "Upload"
    uploadBtn.addEventListener('click', async () => {
        if (filesToUpload.length === 0) return;

        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';

        const groupName = 'session-' + Math.random().toString(36).substring(2, 9);
        const socket = new WebSocket(`ws://127.0.0.1:9000/${groupName}/`);
        
        socket.onopen = () => startUpload(filesToUpload, groupName);
        socket.onmessage = event => {
            const data = JSON.parse(event.data).message;
            if (data.status === 'success') {
                const cleanFileName = data.filename.replace(/[^a-zA-Z0-9_-]/g, '');
                const previewElement = document.getElementById(`preview-${cleanFileName}`);
                if (previewElement) displayPreview(data.summary, previewElement);
            }
        };
        
        socket.onclose = () => {
            console.error("WebSocket closed.");
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload Files';
        };
    });
    
    // Memulai proses upload untuk semua file
    async function startUpload(files, groupName) {
        const uploadPromises = files.map(file => uploadFile(file, groupName));
        await Promise.all(uploadPromises);
    }

    // Mengupload satu file
    async function uploadFile(file, groupName) {
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9_-]/g, '');
        const progressBar = document.getElementById(`progress-${cleanFileName}`);

        const CHUNK_SIZE = 1024 * 1024;
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * CHUNK_SIZE;
            const end = start + CHUNK_SIZE;
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append('chunk', chunk, file.name);
            formData.append('filename', file.name);
            formData.append('chunk_index', chunkIndex);
            formData.append('total_chunks', totalChunks);
            formData.append('group_name', groupName);
            
            await fetch('/api/chunk-upload/', { method: 'POST', body: formData });
            progressBar.value = ((chunkIndex + 1) / totalChunks) * 100;
        }
    }

    // Fungsi untuk menampilkan ringkasan
    function displayPreview(summaryText, previewElement) {
        previewElement.innerHTML = `
            <div style="text-align: left; background-color: #e9ecef; border-radius: 8px; padding: 15px; margin-top: 10px;">
                <h6 style="margin-top: 0; font-weight: 500;">Document Summary:</h6>
                <p style="white-space: pre-wrap;">${summaryText}</p>
            </div>
        `;
    }
});
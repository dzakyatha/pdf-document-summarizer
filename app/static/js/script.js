document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const progressPreviewArea = document.getElementById('progress-preview-area');

    let filesToUpload = [];
    let summaryData = {}; // Menyimpan data ringkasan untuk setiap file
    let processedFiles = new Set(); // Track file yang sudah berhasil diproses
    let isUploading = false; // Track status upload sedang berlangsung

    // Mencegah browser membuka file saat di-drag
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    // Menangani file baru dari drag & drop
    function handleFiles(newFiles) {
        for (const file of newFiles) {
            if (!filesToUpload.some(f => f.name === file.name && f.size === file.size)) {
                filesToUpload.push(file);
            }
        }
        updateFileListUI();
        updateUploadButtonVisibility();
    }

    // Menampilkan daftar file dan progress bar awal
    function updateFileListUI() {
        // Hapus hanya item yang tidak ada di filesToUpload
        const existingItems = progressPreviewArea.querySelectorAll('.progress-item');
        existingItems.forEach(item => {
            const itemId = item.id;
            const cleanFileName = itemId.replace('item-', '');
            const fileExists = filesToUpload.some(file => 
                file.name.replace(/[^a-zA-Z0-9_.-]/g, '') === cleanFileName
            );
            if (!fileExists) {
                item.remove();
                // Hapus juga data ringkasan dan tracking
                delete summaryData[cleanFileName];
                processedFiles.delete(cleanFileName);
            }
        });

        // Tambahkan item baru yang belum ada
        filesToUpload.forEach((file, index) => {
            const cleanFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '');
            const existingItem = document.getElementById(`item-${cleanFileName}`);
            
            if (!existingItem) {
                const fileItemHTML = `
                    <div class="progress-item" id="item-${cleanFileName}">
                        <div class="file-info">
                            <span>${file.name}</span>
                            <button type="button" class="remove-file-btn" data-index="${index}">&times;</button>
                        </div>
                        <progress id="progress-${cleanFileName}" value="0" max="100"></progress>
                        <div id="preview-container-${cleanFileName}"></div>
                    </div>
                `;
                progressPreviewArea.insertAdjacentHTML('beforeend', fileItemHTML);
                
                // Jika sudah ada ringkasan untuk file ini, tampilkan kembali dan set progress ke 100%
                if (summaryData[cleanFileName]) {
                    const containerElement = document.getElementById(`preview-container-${cleanFileName}`);
                    const progressBar = document.getElementById(`progress-${cleanFileName}`);
                    showViewSummaryButton(summaryData[cleanFileName], cleanFileName, containerElement);
                    if (progressBar) {
                        progressBar.value = 100;
                    }
                    processedFiles.add(cleanFileName);
                }
            }
        });

        // Update indeks tombol remove
        const removeButtons = progressPreviewArea.querySelectorAll('.remove-file-btn');
        removeButtons.forEach((btn, index) => {
            btn.dataset.index = index;
        });
    }

    // Fungsi untuk mengupdate visibilitas tombol upload
    function updateUploadButtonVisibility() {
        const hasUnprocessedFiles = filesToUpload.some(file => {
            const cleanFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '');
            return !processedFiles.has(cleanFileName);
        });

        if (isUploading) {
            // Saat sedang upload, disable tombol dan ubah teks
            uploadBtn.style.display = 'block';
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Uploading...';
        } else if (hasUnprocessedFiles) {
            uploadBtn.style.display = 'block';
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload';
        } else if (filesToUpload.length > 0) {
            // Semua file sudah diproses, sembunyikan tombol atau ubah teks
            uploadBtn.style.display = 'none';
            // Atau alternatif, tampilkan tapi disable:
            // uploadBtn.disabled = true;
            // uploadBtn.textContent = 'Semua File Sudah Diproses';
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

    // Event listener untuk menghapus file dan menampilkan ringkasan
    progressPreviewArea.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-file-btn')) {
            const indexToRemove = parseInt(e.target.dataset.index, 10);
            const fileToRemove = filesToUpload[indexToRemove];
            const cleanFileName = fileToRemove.name.replace(/[^a-zA-Z0-9_.-]/g, '');
            
            // Hapus file dari array
            filesToUpload.splice(indexToRemove, 1);
            
            // Hapus data ringkasan dan tracking
            delete summaryData[cleanFileName];
            processedFiles.delete(cleanFileName);
            
            updateFileListUI();
            updateUploadButtonVisibility();
        }
        if (e.target.classList.contains('view-summary-btn')) {
            const fileName = e.target.dataset.filename;
            const summaryContent = document.getElementById(`summary-content-${fileName}`);
            
            if (summaryContent.style.display === 'none') {
                summaryContent.style.display = 'block';
                e.target.textContent = 'Sembunyikan';
            } else {
                summaryContent.style.display = 'none';
                e.target.textContent = 'Lihat Ringkasan';
            }
        }
    });
    
    // Fungsi untuk menampilkan notifikasi
    function showNotification(message, type = 'info') {
        // Hapus notifikasi yang sudah ada
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = 'notification';
        
        const colors = {
            'success': '#28a745',
            'info': '#17a2b8',
            'warning': '#ffc107',
            'error': '#dc3545'
        };
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: ${colors[type] || colors.info};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            font-size: 14px;
            max-width: 350px;
            word-wrap: break-word;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Animasi masuk
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Auto hide setelah 4 detik
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 4000);
    }

    // Event listener untuk tombol Upload
    uploadBtn.addEventListener('click', async () => {
        // Cegah multiple upload yang bersamaan - SET DI AWAL SEKALI
        if (isUploading) {
            showNotification('Upload sedang berlangsung, mohon tunggu...', 'warning');
            return;
        }

        // SET UPLOADING = TRUE DI AWAL SEBELUM SEMUA PROSES
        isUploading = true;
        updateUploadButtonVisibility();

        // Filter hanya file yang belum diproses
        const unprocessedFiles = filesToUpload.filter(file => {
            const cleanFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '');
            return !processedFiles.has(cleanFileName);
        });

        if (unprocessedFiles.length === 0) {
            showNotification('Semua file sudah diproses! Tidak ada file baru untuk diupload.', 'info');
            // Reset jika tidak ada file untuk diproses
            isUploading = false;
            updateUploadButtonVisibility();
            return;
        }

        const groupName = 'session-' + Math.random().toString(36).substring(2, 9);
        const socket = new WebSocket(`ws://127.0.0.1:9000/${groupName}/`);
        
        socket.onopen = () => {
            startUpload(unprocessedFiles, groupName);
        };
        
        socket.onmessage = event => {
            const data = JSON.parse(event.data).message;
            if (data.status === 'success') {
                const cleanFileName = data.filename.replace(/[^a-zA-Z0-9_.-]/g, '');
                
                // Simpan data ringkasan dan tandai sebagai sudah diproses
                summaryData[cleanFileName] = data.summary;
                processedFiles.add(cleanFileName);
                
                const previewContainer = document.getElementById(`preview-container-${cleanFileName}`);
                if (previewContainer) {
                    showViewSummaryButton(data.summary, cleanFileName, previewContainer);
                }
                
                // Notifikasi sukses untuk setiap file
                showNotification(`Ringkasan berhasil dibuat untuk: ${data.filename}`, 'success');
            }
        };
        
        socket.onclose = (event) => {
            console.log("WebSocket closed. Code:", event.code, "Reason:", event.reason);
            // Reset status upload dan update UI
            isUploading = false;
            updateUploadButtonVisibility();
        };
        
        socket.onerror = (error) => {
            console.error("WebSocket error:", error);
            showNotification('Terjadi kesalahan saat menghubungkan ke server', 'error');
            // Reset status upload dan update UI
            isUploading = false;
            updateUploadButtonVisibility();
        };
    });
    
    // Memulai proses upload untuk semua file
    async function startUpload(files, groupName) {
        try {
            showNotification(`Memulai upload ${files.length} file...`, 'info');
            const uploadPromises = files.map(file => uploadFile(file, groupName));
            await Promise.all(uploadPromises);
            
            showNotification(`Semua file berhasil diupload dan diproses!`, 'success');
        } catch (error) {
            console.error('Error during upload:', error);
            showNotification('Terjadi kesalahan saat mengupload file', 'error');
        } finally {
            isUploading = false;
            updateUploadButtonVisibility();
        }
    }

    // Mengupload satu file
    async function uploadFile(file, groupName) {
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '');
        const progressBar = document.getElementById(`progress-${cleanFileName}`);

        const CHUNK_SIZE = 1024 * 1024;
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        
        try {
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
                
                const response = await fetch('/api/chunk-upload/', { method: 'POST', body: formData });
                
                if (!response.ok) {
                    throw new Error(`Upload failed: ${response.status}`);
                }
                
                if (progressBar) {
                    progressBar.value = ((chunkIndex + 1) / totalChunks) * 100;
                }
            }
            console.log(`Upload selesai untuk: ${file.name}`);
        } catch (error) {
            console.error(`Error uploading ${file.name}:`, error);
            throw error;
        }
    }

    // Fungsi untuk menampilkan tombol "Lihat Ringkasan" yang lebih kecil dan di sebelah kiri
    function showViewSummaryButton(summaryText, cleanFileName, containerElement) {
        containerElement.innerHTML = `
            <div style="margin-top: 10px; text-align: left;">
                <button type="button" 
                        class="view-summary-btn" 
                        data-filename="${cleanFileName}"
                        style="
                            background-color: #007bff;
                            color: white;
                            border: none;
                            padding: 6px 12px;
                            border-radius: 4px;
                            font-size: 12px;
                            cursor: pointer;
                            transition: background-color 0.3s ease;
                        "
                        onmouseover="this.style.backgroundColor='#0056b3'"
                        onmouseout="this.style.backgroundColor='#007bff'">
                     Lihat Ringkasan
                </button>
            </div>
            <div id="summary-content-${cleanFileName}" 
                 style="display: none; text-align: left; background-color: #f8f9fa; border-radius: 8px; padding: 15px; margin-top: 10px; border-left: 4px solid #007bff;">
                <div style="margin-bottom: 10px;">
                    <strong style="color: #495057;">Ringkasan Dokumen:</strong>
                </div>
                <p style="white-space: pre-wrap; margin: 0; line-height: 1.5; color: #000000ff;">${summaryText}</p>
            </div>
        `;
    }
});
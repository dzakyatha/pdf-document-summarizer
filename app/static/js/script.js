document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const progressPreviewArea = document.getElementById('progress-preview-area');

    let filesToUpload = [];
    let summaryData = {}; // Menyimpan data ringkasan untuk setiap file
    let processedFiles = new Set(); // Track file yang sudah berhasil diproses
    let promptReadyFiles = new Set(); // Track file yang sudah mendapat prompt (intermediate state)
    let isUploading = false; // Track status upload sedang berlangsung
    let socket;

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
                promptReadyFiles.delete(cleanFileName);
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

    // Fungsi untuk mengecek file yang benar-benar belum diproses sama sekali
    function getUnprocessedFiles() {
        return filesToUpload.filter(file => {
            const cleanFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '');
            // File dianggap "unprocessed" jika belum ada prompt editor DAN belum ada ringkasan
            return !promptReadyFiles.has(cleanFileName) && !processedFiles.has(cleanFileName);
        });
    }

    // Fungsi untuk mengupdate visibilitas tombol upload
    function updateUploadButtonVisibility() {
        const unprocessedFiles = getUnprocessedFiles();

        if (isUploading) {
            // Saat sedang upload, disable tombol dan ubah teks
            uploadBtn.style.display = 'block';
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Uploading...';
        } else if (unprocessedFiles.length > 0) {
            uploadBtn.style.display = 'block';
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload';
        } else {
            // Sembunyikan tombol upload jika tidak ada file baru atau semua file sudah diupload
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
            promptReadyFiles.delete(cleanFileName);
            
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
                e.target.textContent = '📄 Lihat Ringkasan';
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

    // Event listener utama untuk tombol Upload
    uploadBtn.addEventListener('click', async () => {
        // Cegah multiple upload yang bersamaan - SET DI AWAL SEKALI
        if (isUploading) {
            showNotification('⏳ Upload sedang berlangsung, mohon tunggu...', 'warning');
            return;
        } else if (filesToUpload.length === 0) {
            showNotification('⚠️ Tidak ada file untuk diupload!', 'warning');
            return;
        }

        // SET UPLOADING = TRUE DI AWAL SEBELUM SEMUA PROSES
        isUploading = true;
        updateUploadButtonVisibility();

        // Filter hanya file yang benar-benar belum diproses sama sekali
        const unprocessedFiles = getUnprocessedFiles();

        if (unprocessedFiles.length === 0) {
            showNotification('ℹ️ Semua file sudah diupload atau sedang diproses!', 'info');
            // Reset jika tidak ada file untuk diproses
            isUploading = false;
            updateUploadButtonVisibility();
            return;
        }

        // Tutup WebSocket yang lama jika ada
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.close();
        }

        const groupName = 'session-' + Math.random().toString(36).substring(2, 9);
        socket = new WebSocket(`ws://127.0.0.1:9000/${groupName}/`);
        
        socket.onopen = () => {
            console.log("WebSocket terhubung untuk sesi: ", groupName);
            startUpload(unprocessedFiles, groupName);
        };
        
        socket.onmessage = event => {
            try {
                const parsedData = JSON.parse(event.data);

                if (!parsedData || !parsedData.message) {
                    console.error('Invalid message format:', parsedData);
                    return;
                }

                const data = parsedData.message;

                if (!data.filename) {
                    console.error('Filename is missing in message data:', data);
                    return;
                }

                const cleanFileName = data.filename.replace(/[^a-zA-Z0-9_.-]/g, '');
                const previewContainer = document.getElementById(`preview-container-${cleanFileName}`);
                
                if (!data.type) {
                    console.error('Message missing type:', data);
                    return;
                }

                switch (data.type) {
                    case 'prompt_ready':
                        if (!data.prompt) {
                            console.error('Prompt ready message missing prompt text:', data);
                            return;
                        }
                        // Tandai file sebagai sudah mendapat prompt
                        promptReadyFiles.add(cleanFileName);
                        showPromptEditor(data.prompt, cleanFileName, previewContainer);
                        break;
                        
                    case 'summary_complete':
                        if (!data.summary) {
                            console.error('Summary complete message missing summary text:', data);
                            return;
                        }
                        summaryData[cleanFileName] = data.summary;
                        processedFiles.add(cleanFileName);
                        
                        if (previewContainer) {
                            showViewSummaryButton(data.summary, cleanFileName, previewContainer);
                        } else {
                            console.error('Preview container not found for:', cleanFileName);
                        }
                        
                        showNotification(`✅ Ringkasan berhasil dibuat untuk: ${data.filename}`, 'success');
                        break;
                        
                    default:
                        console.warn('Unknown message type:', data.type);
                }

            } catch (error) {
                console.error('Error processing WebSocket message:', error);
                console.error('Raw message that caused error:', event.data);
            }
        };
        
        socket.onclose = (event) => {
            console.log("WebSocket closed. Code:", event.code, "Reason:", event.reason);
            // Reset status upload, tapi jangan tampilkan tombol lagi
            isUploading = false;
            // Hanya update jika ada file baru yang ditambahkan
            if (getUnprocessedFiles().length > 0) {
                updateUploadButtonVisibility();
            }
        };
        
        socket.onerror = (error) => {
            console.error("WebSocket error:", error);
            showNotification('❌ Terjadi kesalahan saat menghubungkan ke server', 'error');
            // Reset status upload dan update UI hanya jika ada file baru
            isUploading = false;
            if (getUnprocessedFiles().length > 0) {
                updateUploadButtonVisibility();
            }
        };
    });
    
    // Memulai proses upload untuk semua file
    async function startUpload(files, groupName) {
        try {
            showNotification(`🚀 Memulai upload ${files.length} file...`, 'info');
            const uploadPromises = files.map(file => uploadFile(file, groupName));
            await Promise.all(uploadPromises);
            
            showNotification(`📤 Semua file berhasil diupload!`, 'success');
        } catch (error) {
            console.error('Error during upload:', error);
            showNotification('❌ Terjadi kesalahan saat mengupload file', 'error');
        } finally {
            // Setelah upload selesai, langsung sembunyikan tombol tanpa reset isUploading
            uploadBtn.style.display = 'none';
            isUploading = false; // Reset untuk file baru yang mungkin ditambahkan nanti
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

    // Fungsi untuk menampilkan editor prompt
    function showPromptEditor(promptText, cleanFileName, containerElement) {
        containerElement.innerHTML = `
            <div style="margin-top: 10px; text-align: left; border: 1px solid #ccc; padding: 10px; border-radius: 8px; background-color: #f8f9fa;">
                <label for="prompt-editor-${cleanFileName}" style="font-weight: bold; margin-bottom: 5px; display: block; color: #495057;">📝 Prompt</label>
                <p style="font-size: 12px; color: #6c757d; margin-top: 0; margin-bottom: 8px;">Anda bisa mengubah prompt berikut sebelum dikirimkan ke model</p>
                <textarea id="prompt-editor-${cleanFileName}" style="width: 100%; height: 150px; border-radius: 4px; border: 1px solid #ccc; padding: 8px; font-family: monospace;">${promptText}</textarea>
                <button type="button" class="submit-prompt-btn" data-filename="${cleanFileName}" style="margin-top: 10px; background-color: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">
                    🚀 Submit
                </button>
            </div>
        `;
    }

    // Event listener untuk tombol submit prompt
    progressPreviewArea.addEventListener('click', (e) => {
        if (e.target.classList.contains('submit-prompt-btn')) {
            const cleanFileName = e.target.dataset.filename;
            const editor = document.getElementById(`prompt-editor-${cleanFileName}`);
            const finalPrompt = editor.value;

            // Kirim prompt final kembali ke server melalui WebSocket
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'execute_summarization',
                    prompt: finalPrompt,
                    filename: filesToUpload.find(f => f.name.replace(/[^a-zA-Z0-9_.-]/g, '') === cleanFileName).name,
                }));
                // Tampilkan status loading
                e.target.parentElement.innerHTML = '<div style="padding: 20px; text-align: center; background-color: #e3f2fd; border-radius: 8px; color: #1976d2;"><strong>⏳ Sedang membuatkan ringkasan...</strong><br><small>Mohon tunggu, model sedang bekerja</small></div>';
                showNotification('📝 Prompt dikirim, sedang memproses...', 'info');
            } else {
                showNotification('❌ Koneksi WebSocket terputus', 'error');
            }
        }
    });

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
                     📄 Lihat Ringkasan
                </button>
            </div>
            <div id="summary-content-${cleanFileName}" 
                 style="display: none; text-align: left; background-color: #f8f9fa; border-radius: 8px; padding: 15px; margin-top: 10px; border-left: 4px solid #007bff;">
                <div style="margin-bottom: 10px;">
                    <strong style="color: #495057;">📋 Ringkasan Dokumen:</strong>
                </div>
                <p style="white-space: pre-wrap; margin: 0; line-height: 1.5; color: #000000ff;">${summaryText}</p>
            </div>
        `;
    }
});
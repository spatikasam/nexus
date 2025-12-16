// GLOBAL STATE
let dataset = [];
const emotions = ['anger', 'fear', 'disgust', 'happiness', 'sadness', 'surprise'];

// FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyDc6m_tMPIAQS1pNzRCXyRJJo75-8M6fz4",
    authDomain: "nexus-emotions.firebaseapp.com",
    projectId: "nexus-emotions",
    storageBucket: "nexus-emotions.firebasestorage.app",
    messagingSenderId: "794178475232",
    appId: "1:794178475232:web:1e00f87111f4ba0e1aec85",
    measurementId: "G-TVVE5FS898"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// DOM ELEMENTS
let uploadArea, imageInput, emotionSelect, uploadBtn, previewEl, syncStatusEl;
let uploadOverlay, uploadStatusText, uploadProgressFill, uploadBox;

// UTILITY FUNCTIONS
function getEmotionColor(emotion) {
    const colors = { 
        anger: '#ff4b5c', disgust: '#46c37b', fear: '#6b5bff',
        happiness: '#ffd166', sadness: '#4d7cff', surprise: '#ff66c4' 
    };
    return colors[emotion] || '#2657d6';
}

// INITIALIZE
document.addEventListener('DOMContentLoaded', () => {
    // Cache DOM elements
    uploadArea = document.getElementById('uploadArea');
    imageInput = document.getElementById('imageInput');
    emotionSelect = document.getElementById('emotionSelect');
    uploadBtn = document.getElementById('uploadBtn');
    previewEl = document.getElementById('preview');
    syncStatusEl = document.getElementById('syncStatus');
    uploadOverlay = document.getElementById('uploadOverlay');
    uploadStatusText = document.getElementById('uploadStatusText');
    uploadProgressFill = document.getElementById('uploadProgressFill');
    uploadBox = document.getElementById('uploadBox');

    // Setup upload handlers if on main page
    if (uploadArea && imageInput && emotionSelect && uploadBtn) {
        setupUploadHandlers();
    }

    // Start data sync
    if (window.location.pathname.includes('visualisation.html')) {
        console.log('Visualization page detected, loading dataset and PCA map...');
        syncDataset().then(() => {
            console.log('Dataset synced, starting PCA mapping...');
            return runPCAMap();
        });
    } else {
        syncDataset();
        setInterval(syncDataset, 10000);
    }
});

function setupUploadHandlers() {
    // Drag & drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.add('drag-highlight'), false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('drag-highlight'), false);
    });
    
    uploadArea.addEventListener('drop', handleDrop, false);
    imageInput.addEventListener('change', handleFileSelect);
    emotionSelect.addEventListener('change', updatePreviewAndButton);
    
    updateUploadButtonState();
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    const files = e.dataTransfer.files;
    imageInput.files = files;
    handleFiles(files);
}

function handleFileSelect() {
    handleFiles(imageInput.files);
}

function handleFiles(files) {
    if (!files || files.length === 0) return;

    const file = Array.from(files).find(f => {
        // Check MIME type and file extension for better compatibility
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
        const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
        const fileName = f.name.toLowerCase();
        
        return f.type.startsWith('image/') || validTypes.includes(f.type) || 
               validExtensions.some(ext => fileName.endsWith(ext));
    });
    
    if (!file) {
        alert('Please select an image file (PNG, JPG, GIF, WebP, etc.)');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        alert('File too large. Maximum 10MB.');
        return;
    }

    // Clear any existing preview first
    if (previewEl) {
        previewEl.innerHTML = '<div style="text-align: center; padding: 20px;">Loading preview...</div>';
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        if (e.target && e.target.result) {
            updatePreview(e.target.result);
            updateUploadButtonState();
        }
    };
    reader.onerror = () => {
        alert('Error reading file. Please try again.');
        console.error('FileReader error:', reader.error);
        if (previewEl) {
            previewEl.innerHTML = '';
        }
    };
    reader.readAsDataURL(file);
}

function updatePreview(imageSrc) {
    if (!previewEl || !imageSrc) return;
    
    const currentEmotion = emotionSelect.value;
    const needsEmotion = !currentEmotion;
    
    // Create image element and preload it before displaying
    const img = new Image();
    
    img.onload = () => {
        // Only update preview once image is fully loaded
        previewEl.innerHTML = `
            <div class="preview-frame">
                <img src="${imageSrc}" alt="preview">
            </div>
        `;
    };
    
    img.onerror = () => {
        console.error('Failed to load image preview');
        previewEl.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff6b6b;">Failed to load preview. Please try a different image.</div>';
    };
    
    img.src = imageSrc;
    
    // Highlight dropdown if emotion not selected
    if (needsEmotion) {
        emotionSelect.classList.add('needs-selection');
    } else {
        emotionSelect.classList.remove('needs-selection');
    }
}

function updatePreviewAndButton() {
    if (imageInput.files.length > 0) {
        updatePreviewFromCurrentFile();
    }
    // Remove highlight when emotion is selected
    if (emotionSelect.value) {
        emotionSelect.classList.remove('needs-selection');
    }
    updateUploadButtonState();
}

function updatePreviewFromCurrentFile() {
    if (!previewEl || !imageInput.files.length) return;
    
    const file = imageInput.files[0];
    
    // Show loading state
    previewEl.innerHTML = '<div style="text-align: center; padding: 20px;">Loading preview...</div>';
    
    const reader = new FileReader();
    reader.onload = (e) => {
        if (e.target && e.target.result) {
            updatePreview(e.target.result);
        }
    };
    reader.onerror = () => {
        console.error('FileReader error:', reader.error);
        previewEl.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff6b6b;">Failed to load preview.</div>';
    };
    reader.readAsDataURL(file);
}

function updateUploadButtonState() {
    if (!uploadBtn || !imageInput || !emotionSelect) return;
    
    const hasFile = imageInput.files && imageInput.files.length > 0;
    const hasEmotion = emotionSelect.value !== '';
    uploadBtn.disabled = !(hasFile && hasEmotion);
}

// IMAGE COMPRESSION HELPERS
function compressImage(file, maxWidth = 800, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Resize if width exceeds maxWidth
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to blob with compression
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// UPLOAD FUNCTION WITH PROGRESS OVERLAY
async function submitEntry() {
    showUploadProgress('Preparing your object...', 10);

    const file = imageInput.files[0];
    const emotion = emotionSelect.value;
    
    if (!file || !emotion) {
        hideUploadProgress();
        alert('Please select an image and emotion.');
        return;
    }

    try {
        // 1. Compress and resize image to save storage
        showUploadProgress('Optimizing image...', 20);
        const compressedBlob = await compressImage(file, 800, 0.85);
        
        // 2. Convert to base64 for upload
        showUploadProgress('Converting image...', 40);
        const base64Data = await blobToBase64(compressedBlob);

        // 3. Upload to Firebase Storage
        showUploadProgress('Uploading to cloud...', 50);
        const storageRef = storage.ref(`nexus/${Date.now()}_${file.name}`);
        const uploadTask = storageRef.putString(base64Data, 'base64');
        await uploadTask.then(
            async () => {
                // 4. Get download URL
                showUploadProgress('Finalizing...', 95);
                const downloadURL = await storageRef.getDownloadURL();
                
                // 5. Save to Firestore
                await db.collection('nexus').add({
                    emotion: emotion,
                    filename: file.name,
                    imageURL: downloadURL,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // 6. Success!
                showUploadProgress('Success! Added to dataset.', 100);
                await new Promise(r => setTimeout(r, 1200));
                
                resetUploadForm();
                await syncDataset();

                // Scroll to gallery so users see their object
                const gallerySection = document.getElementById('gallery');
                if (gallerySection) {
                    setTimeout(() => gallerySection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
                }
            },
            (error) => {
                console.error('Upload error:', error);
                throw new Error('Storage upload failed');
            }
        );

    } catch (error) {
        console.error('Upload failed:', error);
        showUploadProgress('Upload failed. Please try again.', 0, true);
        setTimeout(() => {
            hideUploadProgress();
        }, 2000);
    }
}

// UPLOAD PROGRESS HELPERS
function showUploadProgress(message, progress = 0, failed = false) {
    if (uploadOverlay && uploadStatusText && uploadProgressFill && uploadBox) {
        uploadStatusText.textContent = message;
        uploadProgressFill.style.width = `${Math.min(100, progress)}%`;
        uploadOverlay.classList.add('active');
        uploadBox.style.opacity = '0.3';
        
        if (failed) {
            uploadOverlay.style.background = 'rgba(255,240,240,0.95)';
            uploadStatusText.style.color = '#e53e3e';
        } else {
            uploadOverlay.style.background = 'rgba(255,255,255,0.95)';
            uploadStatusText.style.color = '#1a1a2e';
        }
    }
}

function hideUploadProgress() {
    if (uploadOverlay) {
        uploadOverlay.classList.remove('active');
        if (uploadBox) uploadBox.style.opacity = '1';
    }
}

function resetUploadForm() {
    imageInput.value = '';
    emotionSelect.value = '';
    if (previewEl) previewEl.innerHTML = '';
    updateUploadButtonState();
    hideUploadProgress();
}

// DATA SYNC
async function syncDataset() {
    // Allow syncing on pages without a status element (e.g., visualisation.html)
    
    try {
        if (syncStatusEl) {
            syncStatusEl.innerHTML = '<span class="live-dot"></span> Syncing…';
            syncStatusEl.classList.add('status-loading');
        }
        
        const snapshot = await db.collection('nexus')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();
            
        dataset = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(),
            timestamp: doc.data().timestamp ? doc.data().timestamp.toDate() : new Date()
        }));
        
        updateGallery();
        if (syncStatusEl) {
            syncStatusEl.innerHTML = `<span class="live-dot"></span> ${dataset.length} ${dataset.length === 1 ? 'object' : 'objects'} in the dataset right now`;
        }
        
    } catch (e) {
        console.error('Sync failed:', e);
        if (syncStatusEl) {
            syncStatusEl.innerHTML = '<span style="opacity: 0.7;">Demo mode</span>';
        }
        dataset = Array(12).fill().map((_, i) => ({
            id: i, 
            emotion: emotions[i % 6], 
            filename: `demo_${i}.jpg`,
            imageURL: `https://picsum.photos/seed/${i}/110/110`,
            timestamp: new Date()
        }));
        updateGallery();
    } finally {
        if (syncStatusEl) syncStatusEl.classList.remove('status-loading');
    }
}

// GALLERY
function updateGallery() {
    const gallery = document.getElementById('gallery');
    const galleryDesc = document.getElementById('galleryDesc');
    if (!gallery) return;
    
    gallery.innerHTML = dataset.map(entry => 
        `<button class="thumb" title="${entry.emotion || 'unknown'} - ${entry.filename || 'demo'}">
            <img src="${entry.imageURL || 'https://picsum.photos/seed/nexus/110/110'}" alt="${entry.filename || 'object'}">
            <div class="emotion-overlay">${entry.emotion || 'unknown'}</div>
        </button>`
    ).join('');
    
    if (galleryDesc) {
        galleryDesc.innerHTML = 
            `Live dataset (${dataset.length} ${dataset.length === 1 ? 'object' : 'objects'} in the dataset). <a href="visualisation.html" class="link">View ML analysis →</a>`;
    }
}

// DOWNLOAD DATASET
function downloadDataset() {
    const dataStr = JSON.stringify(dataset, null, 2);
    const blob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// DATASET LISTS (filenames + emotions)
function getFilenameFromEntry(entry) {
    if (entry.filename) return entry.filename;
    if (entry.imageURL) {
        try {
            const u = new URL(entry.imageURL);
            const base = u.pathname.split('/').pop() || '';
            return base.split('?')[0];
        } catch {
            // Not a valid URL, return as-is
            return entry.imageURL;
        }
    }
    if (entry.imageUrl) return entry.imageUrl;
    return '';
}

function renderDatasetLists() {
    const pre = document.getElementById('datasetLists');
    const empty = document.getElementById('datasetListsEmpty');
    if (!pre || !empty) return;

    if (!dataset || dataset.length === 0) {
        pre.style.display = 'none';
        empty.textContent = 'No dataset loaded yet.';
        return;
    }

    const filenames = dataset.map(getFilenameFromEntry).filter(Boolean);
    const emotionsPresent = Array.from(new Set(dataset.map(d => d.emotion).filter(Boolean))).sort();

    const code = `FIREBASE_FILENAMES = [\n  ${filenames.map(f => JSON.stringify(f)).join(',\n  ')}\n]\n\nEMOTIONS = [ ${emotionsPresent.map(e => JSON.stringify(e)).join(', ')} ]\n`;

    pre.textContent = code;
    pre.style.display = 'block';
    empty.textContent = '';
}

function copyDatasetLists() {
    const pre = document.getElementById('datasetLists');
    if (!pre || !pre.textContent) return;
    navigator.clipboard.writeText(pre.textContent).then(() => {
        const mlStatus = document.getElementById('mlStatus');
        if (mlStatus) {
            mlStatus.textContent = 'Copied dataset lists to clipboard';
            setTimeout(() => (mlStatus.textContent = `PCA ready • ${dataset.length} objects`), 2000);
        }
    }).catch(() => {});
}

// ===== PCA VISUALISATION =====
const pcaState = { scale: 1, tx: 0, ty: 0, basePoints: [], screenPoints: [], images: [] };

function loadImageSafe(url) {
    return new Promise((resolve) => {
        if (!url) {
            resolve(null);
            return;
        }
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

async function extractImageFeaturesPCA(imageURL) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const S = 64;
            canvas.width = S;
            canvas.height = S;
            ctx.drawImage(img, 0, 0, S, S);
            const data = ctx.getImageData(0, 0, S, S).data;
            const n = S * S;
            let rSum=0, gSum=0, bSum=0;
            for (let i=0; i<data.length; i+=4) {
                rSum += data[i];
                gSum += data[i+1];
                bSum += data[i+2];
            }
            const rMean = rSum / n / 255;
            const gMean = gSum / n / 255;
            const bMean = bSum / n / 255;
            let rVar=0, gVar=0, bVar=0;
            let sSum=0, vSum=0;
            for (let i=0; i<data.length; i+=4) {
                const r = data[i]/255, g = data[i+1]/255, b = data[i+2]/255;
                rVar += (r - rMean) * (r - rMean);
                gVar += (g - gMean) * (g - gMean);
                bVar += (b - bMean) * (b - bMean);
                const maxc = Math.max(r,g,b), minc = Math.min(r,g,b);
                const v = maxc;
                const s = maxc === 0 ? 0 : (maxc - minc) / maxc;
                sSum += s; vSum += v;
            }
            rVar = Math.sqrt(rVar / n);
            gVar = Math.sqrt(gVar / n);
            bVar = Math.sqrt(bVar / n);
            const brightness = vSum / n;
            const saturation = sSum / n;
            resolve([rMean, gMean, bMean, rVar, gVar, bVar, brightness, saturation]);
        };
        img.onerror = () => resolve([0.5,0.5,0.5,0.1,0.1,0.1,0.5,0.5]);
        img.src = imageURL;
    });
}

async function runPCAMap() {
    const status = document.getElementById('mlStatus');
    const canvas = document.getElementById('pcaCanvas');
    const legend = document.getElementById('pcaLegend');
    if (!canvas || !legend) return;
    const ctx = canvas.getContext('2d');
    if (!dataset || !dataset.length) {
        if (status) status.textContent = 'No data to analyse yet.';
        return;
    }
    if (status) status.textContent = 'Extracting features…';

    // Gather features
    const feats = [];
    for (const item of dataset) {
        const f = await extractImageFeaturesPCA(item.imageURL || item.imageUrl);
        feats.push(f);
    }
    if (status) status.textContent = 'Computing PCA…';

    // Standardize
    const X = feats;
    const m = X.length, d = X[0].length;
    const means = new Array(d).fill(0);
    const stds = new Array(d).fill(0);
    for (let j=0;j<d;j++) {
        for (let i=0;i<m;i++) means[j]+=X[i][j];
        means[j]/=m;
        for (let i=0;i<m;i++) stds[j]+=Math.pow(X[i][j]-means[j],2);
        stds[j]=Math.sqrt(stds[j]/m)||1;
    }
    const Z = X.map(row=>row.map((v,j)=>(v-means[j])/stds[j]));

    // SVD via numeric.js
    const svd = numeric.svd(Z);
    const V = svd.V; // columns are PCs
    // Project onto first 2 components
    const pc1 = V.map(r=>r[0]);
    const pc2 = V.map(r=>r[1]);
    const Y = Z.map(row=>[
        numeric.dot(row, pc1),
        numeric.dot(row, pc2)
    ]);

    // Scale to canvas
    const pad = 30;
    const W = canvas.clientWidth; const H = canvas.clientHeight;
    canvas.width = W; canvas.height = H;
    const xs = Y.map(p=>p[0]);
    const ys = Y.map(p=>p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    function xScale(x){ return pad + (x-minX)/(maxX-minX||1) * (W-2*pad); }
    function yScale(y){ return H - (pad + (y-minY)/(maxY-minY||1) * (H-2*pad)); }

    // Colors by emotion
    const colorMap = { 
        anger: '#ff4b5c', disgust: '#46c37b', fear: '#6b5bff',
        happiness: '#ffd166', sadness: '#4d7cff', surprise: '#ff66c4'
    };

    // Cache base positions (no pan/zoom yet)
    pcaState.basePoints = Y.map(([x,y]) => ({ x: xScale(x), y: yScale(y) }));
    pcaState.scale = 1; pcaState.tx = 0; pcaState.ty = 0;

    // Load thumbnails
    if (status) status.textContent = 'Loading thumbnails…';
    pcaState.images = await Promise.all(dataset.map(d => loadImageSafe(d.imageURL || d.imageUrl)));

    // Tooltip element (one per page)
    let tooltip = document.getElementById('pcaTooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'pcaTooltip';
        tooltip.style.cssText = 'position:fixed;pointer-events:none;background:rgba(10,14,25,0.9);color:#fff;padding:8px 10px;border-radius:8px;font-size:12px;border:1px solid rgba(255,255,255,0.12);display:none;z-index:1000;';
        document.body.appendChild(tooltip);
    }

    function drawPCA() {
        const { scale, tx, ty, basePoints, images } = pcaState;
        ctx.clearRect(0,0,W,H);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0,0,W,H);
        ctx.font = '12px Inter, system-ui, sans-serif';

        // Compute screen points with current transform
        const screenPts = basePoints.map(p => ({ x: p.x * scale + tx, y: p.y * scale + ty }));
        pcaState.screenPoints = screenPts;

        // Draw thumbnails (fallback to colored dots)
        const thumbSize = 38;
        screenPts.forEach((pt, i) => {
            const img = images[i];
            if (img) {
                const half = thumbSize / 2;
                ctx.save();
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, half, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(img, pt.x - half, pt.y - half, thumbSize, thumbSize);
                ctx.restore();
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, half, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                const radius = 10;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
                ctx.fillStyle = colorMap[dataset[i].emotion] || '#a0a8c4';
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.lineWidth = 1.2;
                ctx.stroke();
            }
        });

        // Axes labels
        ctx.fillStyle = '#a0a8c4';
        ctx.fillText('PC1', W - pad - 20, H - 10);
        ctx.save();
        ctx.translate(10, pad + 20);
        ctx.rotate(-Math.PI/2);
        ctx.fillText('PC2', 0, 0);
        ctx.restore();
    }

    function findHit(mx, my) {
        const screenPts = pcaState.screenPoints || [];
        const hitRadius = 22;
        for (let i = screenPts.length - 1; i >= 0; i--) {
            const pt = screenPts[i];
            const dx = mx - pt.x; const dy = my - pt.y;
            if (dx*dx + dy*dy <= hitRadius*hitRadius) return i;
        }
        return -1;
    }

    function handleHover(ev) {
        const rect = canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        const hit = findHit(mx, my);
        if (hit >= 0) {
            const d = dataset[hit];
            tooltip.style.display = 'block';
            tooltip.style.left = (ev.clientX + 12) + 'px';
            tooltip.style.top = (ev.clientY + 12) + 'px';
            tooltip.innerHTML = `<div style="opacity:.7">${d.filename||'object'}</div><div style="font-weight:600">${d.emotion||'unknown'}</div>`;
        } else {
            tooltip.style.display = 'none';
        }
    }

    // Pan + zoom state
    let isPanning = false;
    let lastX = 0, lastY = 0;

    canvas.onwheel = (ev) => {
        ev.preventDefault();
        const { scale, tx, ty } = pcaState;
        const factor = ev.deltaY < 0 ? 1.1 : 0.9;
        const newScale = Math.max(0.5, Math.min(8, scale * factor));
        const rect = canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        const worldX = (mx - tx) / scale;
        const worldY = (my - ty) / scale;
        pcaState.tx = mx - worldX * newScale;
        pcaState.ty = my - worldY * newScale;
        pcaState.scale = newScale;
        drawPCA();
        handleHover(ev);
    };

    canvas.onmousedown = (ev) => {
        isPanning = true;
        lastX = ev.clientX; lastY = ev.clientY;
        canvas.style.cursor = 'grabbing';
    };
    window.onmouseup = () => { isPanning = false; canvas.style.cursor = 'default'; };
    window.onmousemove = (ev) => {
        if (isPanning) {
            const dx = ev.clientX - lastX;
            const dy = ev.clientY - lastY;
            lastX = ev.clientX; lastY = ev.clientY;
            pcaState.tx += dx;
            pcaState.ty += dy;
            drawPCA();
            return;
        }
        handleHover(ev);
    };

    // Draw initial view
    drawPCA();

    // Legend
    const emotionsSet = Array.from(new Set(dataset.map(d=>d.emotion)));
    legend.innerHTML = emotionsSet.map(e=>`<span style="display:inline-flex;align-items:center;gap:6px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${colorMap[e]||'#a0a8c4'};display:inline-block;"></span>
        ${e}
    </span>`).join('');
    if (status) status.textContent = `PCA ready • ${dataset.length} objects`;

}


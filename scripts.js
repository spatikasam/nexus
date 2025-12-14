// GLOBAL STATE
let dataset = [];
let pyodide = null;
let currentClusters = [];
let clusterDisagreement = [];
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

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// DOM ELEMENTS
let uploadArea, imageInput, emotionSelect, uploadBtn, previewEl, syncStatusEl;

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

    // Setup upload handlers if on main page
    if (uploadArea && imageInput && emotionSelect && uploadBtn) {
        setupUploadHandlers();
    }

    // Start data sync
    if (window.location.pathname.includes('visualisation.html')) {
        syncDataset().then(runClustering);
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
    imageInput.files = files; // Make files available to submitEntry()
    handleFiles(files);
}

function handleFileSelect() {
    handleFiles(imageInput.files);
}

function handleFiles(files) {
    if (!files || files.length === 0) return;

    const file = Array.from(files).find(f => f.type.startsWith('image/'));
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        alert('File too large. Maximum 10MB.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        // Show current emotion (updates live when dropdown changes)
        updatePreview(e.target.result);
        updateUploadButtonState();
    };
    reader.readAsDataURL(file);
}

function updatePreview(imageSrc) {
    if (!previewEl) return;
    
    const currentEmotion = emotionSelect.value || 'pending';
    previewEl.innerHTML = `
        <div class="preview-frame">
            <img src="${imageSrc}" alt="preview">
            <div class="preview-label">${currentEmotion}</div>
        </div>
    `;
}

function updatePreviewAndButton() {
    updatePreviewFromCurrentFile();
    updateUploadButtonState();
}

function updatePreviewFromCurrentFile() {
    if (!previewEl || !imageInput.files.length) return;
    
    const file = imageInput.files[0];
    const reader = new FileReader();
    reader.onload = (e) => updatePreview(e.target.result);
    reader.readAsDataURL(file);
}

function updateUploadButtonState() {
    if (!uploadBtn || !imageInput || !emotionSelect) return;
    
    const hasFile = imageInput.files && imageInput.files.length > 0;
    const hasEmotion = emotionSelect.value !== '';
    uploadBtn.disabled = !(hasFile && hasEmotion);
    
    // Visual feedback
    if (uploadBtn.disabled) {
        uploadBtn.textContent = 'ADD';
    } else {
        uploadBtn.textContent = 'ADD';
    }
}

// UPLOAD FUNCTION (fixed)
async function submitEntry() {
    if (!imageInput || !emotionSelect) {
        alert('Upload elements not found.');
        return;
    }

    const file = imageInput.files[0];
    const emotion = emotionSelect.value;
    
    if (!file || !emotion) {
        alert('Please select an image and emotion.');
        return;
    }

    if (syncStatusEl) {
        syncStatusEl.textContent = 'Uploading…';
        syncStatusEl.classList.add('status-loading');
    }
    
    try {
        // Convert to base64
        const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(file);
        });

        // Upload to Firebase Storage
        const storageRef = storage.ref(`nexus/${Date.now()}_${file.name}`);
        await storageRef.putString(base64, 'base64');
        const downloadURL = await storageRef.getDownloadURL();

        // Save to Firestore
        await db.collection('nexus').add({
            emotion,
            filename: file.name,
            imageURL: downloadURL,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Reset form
        imageInput.value = '';
        emotionSelect.value = '';
        if (previewEl) previewEl.innerHTML = '';
        if (uploadBtn) uploadBtn.disabled = true;

        // Refresh dataset
        await syncDataset();
        
        alert('Upload successful!');
        
    } catch (error) {
        console.error('Upload failed:', error);
        alert('Upload failed. Check console for details.');
        if (syncStatusEl) {
            syncStatusEl.textContent = 'Upload failed';
        }
    } finally {
        if (syncStatusEl) {
            syncStatusEl.classList.remove('status-loading');
        }
    }
}

// DATA SYNC
async function syncDataset() {
    if (!syncStatusEl) return;
    
    try {
        syncStatusEl.textContent = 'Syncing…';
        syncStatusEl.classList.add('status-loading');
        
        const snapshot = await db.collection('nexus')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();
            
        dataset = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateGallery();
        syncStatusEl.textContent = `${dataset.length} objects`;
        
    } catch (e) {
        console.error('Sync failed:', e);
        syncStatusEl.textContent = 'Demo mode';
        dataset = Array(12).fill().map((_, i) => ({
            id: i, emotion: emotions[i % 6], filename: `demo_${i}.jpg`,
            imageURL: `https://picsum.photos/seed/${i}/110/110`
        }));
        updateGallery();
    } finally {
        syncStatusEl.classList.remove('status-loading');
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
        </button>`
    ).join('');
    
    if (galleryDesc) {
        galleryDesc.innerHTML = 
            `Live dataset (${dataset.length} objects). <a href="visualisation.html" class="link">View ML analysis →</a>`;
    }
}

// DOWNLOAD
function downloadDataset() {
    const dataStr = JSON.stringify(dataset, null, 2);
    const blob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// PYODIDE (for visualisation.html)
async function initPyodide() {
    if (pyodide) return pyodide;
    
    const mlStatus = document.getElementById('mlStatus');
    if (mlStatus) mlStatus.textContent = 'Loading ML engine…';
    
    pyodide = await loadPyodide();
    await pyodide.runPythonAsync(`
        import numpy as np
        from sklearn.cluster import KMeans
        from sklearn.decomposition import PCA
    `);
    
    if (mlStatus) mlStatus.textContent = 'ML ready.';
    return pyodide;
}

// CLUSTERING (for visualisation.html)
async function runClustering() {
    if (!dataset.length) {
        const mlStatus = document.getElementById('mlStatus');
        if (mlStatus) mlStatus.textContent = 'No data to analyse yet.';
        return;
    }

    const py = await initPyodide();
    const mlStatus = document.getElementById('mlStatus');
    if (mlStatus) mlStatus.textContent = 'Computing visual clusters…';
    
    const subset = dataset.slice(0, 50);
    const pixelData = await Promise.all(subset.map(async (entry, idx) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = entry.imageURL || `https://picsum.photos/seed/${idx}/110/110`;
        await new Promise(r => img.onload = r);
        
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 64, 64);
        
        const imageData = ctx.getImageData(0, 0, 64, 64).data;
        const rgb = [];
        for (let i = 0; i < imageData.length; i += 4) {
            rgb.push(imageData[i], imageData[i+1], imageData[i+2]);
        }
        return rgb;
    }));
    
    const humanEmotions = subset.map(d => d.emotion || null);

    const result = await py.runPythonAsync(`
        import numpy as np
        from sklearn.cluster import KMeans

        X = np.array(${JSON.stringify(pixelData)}).reshape(-1, 12288).astype(float) / 255.0

        kmeans = KMeans(n_clusters=6, random_state=42, n_init=10, max_iter=100)
        clusters = kmeans.fit_predict(X)

        human_emotions = ${JSON.stringify(humanEmotions)}
        disagreement = []
        for c in range(6):
            cluster_emotions = [human_emotions[i] for i in range(len(human_emotions)) if clusters[i] == c]
            if cluster_emotions:
                unique_emotions = len(set(filter(None, cluster_emotions)))
                disagreement.append(unique_emotions / 6.0)
            else:
                disagreement.append(0)

        {"clusters": clusters.tolist(), "disagreement": disagreement}
    `);
    
    currentClusters = result.clusters.toJs();
    clusterDisagreement = result.disagreement.toJs();
    showClusterView();
}

// VISUALISE PAGE FUNCTIONS
function showClusterView() {
    const statsEl = document.getElementById('clusterStats');
    const galleryEl = document.getElementById('clusterGallery');
    if (!statsEl || !galleryEl) return;

    statsEl.innerHTML = `
        <div class="section-label small">CLUSTER ANALYSIS</div>
        <h2>6 Visual Clusters (${dataset.length} objects)</h2>
        <div class="cluster-previews">
            ${[0,1,2,3,4,5].map(i => `
                <div class="cluster-preview" onclick="zoomCluster(${i})">
                    <div class="cluster-glow" style="
                        box-shadow: 0 0 ${20 + 20 * (clusterDisagreement[i] || 0)}px 
                        rgba(255,255,255,${0.2 + 0.3 * (clusterDisagreement[i] || 0)});
                    "></div>
                    <div>Cluster ${i}</div>
                    <div class="cluster-score">${((clusterDisagreement[i] || 0) * 100).toFixed(0)}% chaos</div>
                </div>
            `).join('')}
        </div>
    `;
    
    const mlStatus = document.getElementById('mlStatus');
    if (mlStatus) {
        const maxDis = Math.max(...clusterDisagreement);
        mlStatus.textContent = `Analysis complete. Max disagreement: ${(maxDis * 100).toFixed(0)}%`;
    }

    // Clear gallery (it will be filled on zoom)
    galleryEl.innerHTML = '';
}

function zoomCluster(clusterId) {
    const galleryEl = document.getElementById('clusterGallery');
    if (!galleryEl) return;

    const subset = dataset.slice(0, 50);
    const clusterImages = subset
        .map((entry, i) => ({...entry, cluster: currentClusters[i]}))
        .filter(entry => entry.cluster === clusterId);
    
    galleryEl.innerHTML = `
        <div class="cluster-detail" style="grid-column: 1 / -1;">
            <button onclick="showClusterView()" class="btn-ghost">← All clusters</button>
            <h3>Cluster ${clusterId} - ${((clusterDisagreement[clusterId] || 0) * 100).toFixed(0)}% disagreement</h3>
            <p>Visually similar objects, different reported emotions:</p>
            <div class="emotion-breakdown">
                ${clusterImages.map(img => 
                    `<span class="emotion-tag">${img.emotion || 'unknown'}</span>`
                ).join('')}
            </div>
        </div>
        ${clusterImages.map(img => `
            <button class="thumb cluster-thumb" title="${img.emotion} - ${img.filename}">
                <img src="${img.imageURL}" alt="${img.filename}">
                <div class="emotion-label">${img.emotion}</div>
            </button>
        `).join('')}
    `;
}

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

// UTILITY FUNCTIONS
function getEmotionColor(emotion) {
    const colors = { 
        anger: '#ff4b5c',
        disgust: '#46c37b',
        fear: '#6b5bff',
        happiness: '#ffd166',
        sadness: '#4d7cff',
        surprise: '#ff66c4' 
    };
    return colors[emotion] || '#2657d6';
}

// DRAG & DROP + INPUT UPLOAD
let uploadArea, imageInput, emotionSelect, uploadBtn;

document.addEventListener('DOMContentLoaded', () => {
    uploadArea = document.getElementById('uploadArea');
    imageInput = document.getElementById('imageInput');
    emotionSelect = document.getElementById('emotionSelect');
    uploadBtn = document.getElementById('uploadBtn');

    if (!uploadArea || !imageInput || !emotionSelect || !uploadBtn) {
        // Probably on visualisation.html
        if (!window.location.pathname.includes('visualisation.html')) {
            console.warn('Upload elements not found on this page.');
        }
    } else {
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
        emotionSelect.addEventListener('change', updateUploadButtonState);
    }

    // Initialise dataset and (maybe) clustering
    if (window.location.pathname.includes('visualisation.html')) {
        syncDataset().then(runClustering);
    } else {
        syncDataset();
        setInterval(syncDataset, 10000);
    }
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    // Set the file onto the hidden input so submitEntry() can read it
    if (files && files.length > 0 && imageInput) {
        imageInput.files = files;
    }
    handleFiles(files);
}

function handleFileSelect() {
    if (!imageInput) return;
    handleFiles(imageInput.files);
}

function handleFiles(files) {
    if (!files || files.length === 0) return;

    const file = Array.from(files).find(f => f.type.startsWith('image/'));
    if (file && file.size <= 10 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => {
            showPreview(e.target.result, emotionSelect ? emotionSelect.value : '');
            updateUploadButtonState();
        };
        reader.readAsDataURL(file);
    } else if (file && file.size > 10 * 1024 * 1024) {
        alert('File too large. Maximum 10MB.');
    }
}

function updateUploadButtonState() {
    if (!uploadBtn || !imageInput || !emotionSelect) return;
    const hasFile = imageInput.files && imageInput.files.length > 0;
    const hasEmotion = !!emotionSelect.value;
    uploadBtn.disabled = !(hasFile && hasEmotion);
}

// DATA SYNC
async function syncDataset() {
    const statusEl = document.getElementById('syncStatus');
    if (!statusEl) return;
    
    try {
        statusEl.textContent = 'Syncing…';
        statusEl.classList.add('status-loading');
        
        const snapshot = await db.collection('nexus')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();
        dataset = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        updateGallery();
        statusEl.textContent = `${dataset.length} objects`;
        statusEl.classList.remove('status-loading');
        
    } catch (e) {
        console.error('Sync failed, using demo data', e);
        statusEl.textContent = 'Demo mode';
        dataset = Array(12).fill().map((_, i) => ({
            id: i,
            emotion: emotions[i % 6],
            filename: `demo_${i}.jpg`,
            imageURL: `https://picsum.photos/seed/${i}/110/110`
        }));
        updateGallery();
    }
}

// UPLOAD
async function submitEntry() {
    const statusEl = document.getElementById('syncStatus');
    if (!imageInput || !emotionSelect) {
        alert('Upload elements not found on this page.');
        return;
    }

    const file = imageInput.files[0];
    const emotion = emotionSelect.value;
    
    if (!file || !emotion) {
        alert('Select image and emotion.');
        return;
    }

    if (statusEl) {
        statusEl.textContent = 'Uploading…';
        statusEl.classList.add('status-loading');
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const base64 = e.target.result.split(',')[1];
            const storageRef = storage.ref(`nexus/${Date.now()}_${file.name}`);
            await storageRef.putString(base64, 'base64');
            const downloadURL = await storageRef.getDownloadURL();
            
            await db.collection('nexus').add({
                emotion,
                filename: file.name,
                imageURL: downloadURL,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            imageInput.value = '';
            emotionSelect.value = '';
            if (uploadBtn) uploadBtn.disabled = true;
            const previewEl = document.getElementById('preview');
            if (previewEl) previewEl.innerHTML = '';
            
            await syncDataset();
        } catch (err) {
            alert('Upload failed.');
            console.error(err);
        } finally {
            if (statusEl) statusEl.classList.remove('status-loading');
        }
    };
    reader.readAsDataURL(file);
}

// PREVIEW
function showPreview(imageSrc, emotion) {
    const previewEl = document.getElementById('preview');
    if (!previewEl) return;

    previewEl.innerHTML = `
        <div class="preview-frame">
            <img src="${imageSrc}" alt="preview">
            <div class="preview-label">${emotion || 'pending'}</div>
        </div>
    `;
}

// GALLERY
function updateGallery() {
    const gallery = document.getElementById('gallery');
    const desc = document.getElementById('galleryDesc');
    if (!gallery) return;
    
    gallery.innerHTML = dataset.map(entry => 
        `<button class="thumb" title="${entry.emotion || 'unknown'} - ${entry.filename || 'demo'}">
            <img src="${entry.imageURL || 'https://picsum.photos/seed/nexus/110/110'}" alt="${entry.filename || 'object'}">
        </button>`
    ).join('');
    
    if (desc) {
        desc.innerHTML = 
            `Live dataset (${dataset.length} objects). <a href="visualisation.html" class="link">View ML analysis →</a>`;
    }
}

// UTILITIES
function downloadDataset() {
    const dataStr = JSON.stringify(dataset, null, 2);
    const blob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
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

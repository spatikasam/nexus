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
        anger: '#ff4b5c', disgust: '#46c37b', fear: '#6b5bff',
        happiness: '#ffd166', sadness: '#4d7cff', surprise: '#ff66c4' 
    };
    return colors[emotion] || '#2657d6';
}

// DRAG & DROP UPLOAD
document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('uploadArea');
    const imageInput = document.getElementById('imageInput');
    
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
    
    // Enable upload button when emotion selected
    document.getElementById('emotionSelect').addEventListener('change', (e) => {
        document.getElementById('uploadBtn').disabled = !e.target.value;
    });
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFileSelect() {
    handleFiles(imageInput.files);
}

function handleFiles(files) {
    const file = Array.from(files).find(f => f.type.startsWith('image/'));
    if (file && file.size <= 10 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => {
            showPreview(e.target.result, document.getElementById('emotionSelect').value);
            document.getElementById('uploadBtn').disabled = !document.getElementById('emotionSelect').value;
        };
        reader.readAsDataURL(file);
    } else if (file && file.size > 10 * 1024 * 1024) {
        alert('File too large. Maximum 10MB.');
    }
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
        statusEl.textContent = 'Demo mode';
        dataset = Array(12).fill().map((_, i) => ({
            id: i, emotion: emotions[i % 6], filename: `demo_${i}.jpg`,
            imageURL: `https://picsum.photos/seed/${i}/110/110`
        }));
        updateGallery();
    }
}

// UPLOAD
async function submitEntry() {
    const file = document.getElementById('imageInput').files[0];
    const emotion = document.getElementById('emotionSelect').value;
    
    if (!file || !emotion) {
        alert('Select image and emotion.');
        return;
    }
    
    const statusEl = document.getElementById('syncStatus');
    statusEl.textContent = 'Uploading…';
    statusEl.classList.add('status-loading');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const base64 = e.target.result.split(',')[1];
            const storageRef = storage.ref(`nexus/${Date.now()}_${file.name}`);
            await storageRef.putString(base64, 'base64');
            const downloadURL = await storageRef.getDownloadURL();
            
            await db.collection('nexus').add({
                emotion, filename: file.name, imageURL: downloadURL,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            document.getElementById('imageInput').value = '';
            document.getElementById('emotionSelect').value = '';
            document.getElementById('uploadBtn').disabled = true;
            document.getElementById('preview').innerHTML = '';
            
            await syncDataset();
        } catch (err) {
            alert('Upload failed.');
            console.error(err);
        } finally {
            statusEl.classList.remove('status-loading');
        }
    };
    reader.readAsDataURL(file);
}

// PREVIEW
function showPreview(imageSrc, emotion) {
    document.getElementById('preview').innerHTML = `
        <div class="preview-frame">
            <img src="${imageSrc}" alt="preview">
            <div class="preview-label">${emotion || 'pending'}</div>
        </div>
    `;
}

// GALLERY
function updateGallery() {
    const gallery = document.getElementById('gallery');
    if (!gallery) return;
    
    gallery.innerHTML = dataset.map(entry => 
        `<button class="thumb" title="${entry.emotion || 'unknown'} - ${entry.filename || 'demo'}">
            <img src="${entry.imageURL || 'https://picsum.photos/seed/nexus/110/110'}" alt="${entry.filename || 'object'}">
        </button>`
    ).join('');
    
    document.getElementById('galleryDesc').innerHTML = 
        `Live dataset (${dataset.length} objects). <a href="visualize.html" class="link">View ML analysis →</a>`;
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

// PYODIDE (for visualize.html)
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

// CLUSTERING (for visualize.html)
async function runClustering() {
    const py = await initPyodide();
    const mlStatus = document.getElementById('mlStatus');
    if (mlStatus) mlStatus.textContent = 'Computing visual clusters…';
    
    // Extract pixel data
    const pixelData = await Promise.all(dataset.slice(0, 50).map(async (entry, idx) => {
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
    
    const result = await py.runPythonAsync(`
        import numpy as np
        X = np.array(${JSON.stringify(pixelData)}).reshape(-1, 12288).astype(float) / 255.0
        
        kmeans = KMeans(n_clusters=6, random_state=42, n_init=10, max_iter=100)
        clusters = kmeans.fit_predict(X)
        
        human_emotions = ${JSON.stringify(dataset.slice(0,50).map(d => d.emotion))}
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

// VISUALIZE PAGE FUNCTIONS
function showClusterView() {
    const statsEl = document.getElementById('clusterStats');
    const galleryEl = document.getElementById('clusterGallery');
    
    statsEl.innerHTML = `
        <div class="section-label small">CLUSTER ANALYSIS</div>
        <h2>6 Visual Clusters (${dataset.length} objects)</h2>
        <div class="cluster-previews">
            ${currentClusters.slice(0,6).map((c,i) => `
                <div class="cluster-preview" onclick="zoomCluster(${i})">
                    <div class="cluster-glow" style="
                        box-shadow: 0 0 ${20 + 20*clusterDisagreement[i]}px 
                        rgba(255,255,255,${0.2 + 0.3*clusterDisagreement[i]});
                    "></div>
                    <div>Cluster ${i}</div>
                    <div class="cluster-score">${(clusterDisagreement[i]*100).toFixed(0)}% chaos</div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.getElementById('mlStatus').textContent = 
        `Analysis complete. Max disagreement: ${(Math.max(...clusterDisagreement)*100).toFixed(0)}%`;
}

function zoomCluster(clusterId) {
    const clusterImages = dataset.slice(0,50)
        .map((entry, i) => ({...entry, cluster: currentClusters[i]}))
        .filter(entry => entry.cluster === clusterId);
    
    document.getElementById('clusterGallery').innerHTML = `
        <div class="cluster-detail" style="grid-column: 1 / -1;">
            <button onclick="showClusterView()" class="btn-ghost">← All clusters</button>
            <h3>Cluster ${clusterId} - ${(clusterDisagreement[clusterId]*100).toFixed(0)}% disagreement</h3>
            <p>Visually identical objects, wildly different emotions:</p>
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

// INIT
if (window.location.pathname.includes('visualize.html')) {
    syncDataset().then(runClustering);
} else {
    syncDataset();
    setInterval(syncDataset, 10000);
}

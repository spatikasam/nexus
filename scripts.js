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
    imageInput.files = files;
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
    if (imageInput.files.length > 0) {
        updatePreviewFromCurrentFile();
    }
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
        // 1. Convert to blob for upload
        showUploadProgress('Converting image...', 20);
        const base64Data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(file);
        });

        // 2. Upload to Firebase Storage with real progress
        showUploadProgress('Uploading to cloud...', 30);
        const storageRef = storage.ref(`nexus/${Date.now()}_${file.name}`);
        const uploadTask = storageRef.putString(base64Data, 'base64');
             // Real-time upload progress
     uploadTask.on('state_changed',
       (snapshot) => {
         const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 60; // 30-90%
         showUploadProgress('Uploading...', 30 + progress);
       }
     );


        // Real-time upload progress
await uploadTask.then(
     async () => {
       // 3. Get download URL
       showUploadProgress('Finalizing...', 95);
       const downloadURL = await storageRef.getDownloadURL();
       
       // 4. Save to Firestore
       await db.collection('nexus').add({
         emotion: emotion,
         filename: file.name,
         imageURL: downloadURL,
         timestamp: firebase.firestore.FieldValue.serverTimestamp()
       });
       
       // 5. Success!
       showUploadProgress('Success! Added to dataset.', 100);
       await new Promise(r => setTimeout(r, 1200));
       
       resetUploadForm();
       await syncDataset();
     },
     (error) => {
       console.error('Upload error:', error);
       throw new Error('Storage upload failed');
     }
   );
        );

    } catch (error) {
        console.error('Upload failed:', error);
        showUploadProgress('Upload failed', 0, true);
        setTimeout(() => {
            hideUploadProgress();
            alert(`Upload failed: ${error.message}`);
        }, 1500);
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
    if (!syncStatusEl) return;
    
    try {
        syncStatusEl.textContent = 'Syncing…';
        syncStatusEl.classList.add('status-loading');
        
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
        syncStatusEl.textContent = `${dataset.length} objects`;
        
    } catch (e) {
        console.error('Sync failed:', e);
        syncStatusEl.textContent = 'Demo mode';
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
        </button>`
    ).join('');
    
    if (galleryDesc) {
        galleryDesc.innerHTML = 
            `Live dataset (${dataset.length} objects). <a href="visualisation.html" class="link">View ML analysis →</a>`;
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

// PYODIDE CLUSTERING (for visualisation.html)
let pyodide = null;
async function initPyodide() {
    if (pyodide) return pyodide;
    
    const mlStatus = document.getElementById('mlStatus');
    if (mlStatus) mlStatus.textContent = 'Loading ML engine…';
    
    pyodide = await loadPyodide();
    await pyodide.runPythonAsync(`
        import numpy as np
        from sklearn.cluster import KMeans
    `);
    
    if (mlStatus) mlStatus.textContent = 'ML ready.';
    return pyodide;
}

async function runClustering() {
    if (!dataset.length) {
        const mlStatus = document.getElementById('mlStatus');
        if (mlStatus) mlStatus.textContent = 'No data to analyse yet.';
        return;
    }

    const py = await initPyodide();
    const mlStatus = document.getElementById('mlStatus');
    if (mlStatus) mlStatus.textContent = 'Computing visual clusters…';
    
    // Simplified clustering with demo data for now
    currentClusters = Array(dataset.length).fill().map(() => Math.floor(Math.random() * 6));
    clusterDisagreement = [0.4, 0.7, 0.3, 0.9, 0.2, 0.6];
    showClusterView();
}

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
}

function zoomCluster(clusterId) {
    const galleryEl = document.getElementById('clusterGallery');
    if (!galleryEl) return;

    const clusterImages = dataset
        .map((entry, i) => ({...entry, cluster: currentClusters[i]}))
        .filter(entry => entry.cluster === clusterId);
    
    galleryEl.innerHTML = `
        <div class="cluster-detail" style="grid-column: 1 / -1;">
            <button onclick="showClusterView()" class="btn-ghost">← All clusters</button>
            <h3>Cluster ${clusterId} - ${((clusterDisagreement[clusterId] || 0) * 100).toFixed(0)}% disagreement</h3>
            <p>Visually similar objects, different reported emotions:</p>
            <div class="emotion-breakdown">
                ${clusterImages.slice(0, 20).map(img => 
                    `<span class="emotion-tag">${img.emotion || 'unknown'}</span>`
                ).join('')}
            </div>
        </div>
        ${clusterImages.slice(0, 20).map(img => `
            <button class="thumb cluster-thumb" title="${img.emotion} - ${img.filename}">
                <img src="${img.imageURL}" alt="${img.filename}">
                <div class="emotion-label">${img.emotion}</div>
            </button>
        `).join('')}
    `;
}

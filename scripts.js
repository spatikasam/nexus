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
    if (!file) {
        alert('Please select an image file (PNG, JPG, etc.)');
        return;
    }

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
    
    const currentEmotion = emotionSelect.value;
    const needsEmotion = !currentEmotion;
    previewEl.innerHTML = `
        <div class="preview-frame">
            <img src="${imageSrc}" alt="preview">
            <div class="preview-label ${needsEmotion ? 'needs-selection' : ''}">
                ${needsEmotion ? '↑ Choose emotion above ↑' : currentEmotion}
            </div>
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
        syncStatusEl.innerHTML = `<span style="opacity: 0.7;">📦</span> ${dataset.length} ${dataset.length === 1 ? 'object' : 'objects'}`;
        
    } catch (e) {
        console.error('Sync failed:', e);
        syncStatusEl.innerHTML = '<span style="opacity: 0.7;">Demo mode</span>';
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

// PYODIDE CLUSTERING (for visualisation.html)
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
    const mlStatus = document.getElementById('mlStatus');
    
    if (!dataset.length) {
        if (mlStatus) mlStatus.textContent = 'No data to analyse yet.';
        return;
    }

    if (dataset.length < 6) {
        if (mlStatus) mlStatus.textContent = `Need at least 6 objects (currently ${dataset.length})`;
        currentClusters = dataset.map((_, i) => i % 6);
        clusterDisagreement = [0, 0, 0, 0, 0, 0];
        showClusterView();
        return;
    }

    try {
        const py = await initPyodide();
        if (mlStatus) mlStatus.textContent = 'Extracting visual features…';
        
        // Extract color features from images
        const features = await extractImageFeatures(dataset);
        
        if (mlStatus) mlStatus.textContent = 'Running K-Means clustering…';
        
        // Convert features to numpy array and run KMeans
        py.globals.set('features', features);
        const clusterLabels = await py.runPythonAsync(`
import numpy as np
from sklearn.cluster import KMeans

# Convert features to numpy array
X = np.array(features.to_py())

# Run KMeans with 6 clusters
kmeans = KMeans(n_clusters=6, random_state=42, n_init=10)
labels = kmeans.fit_predict(X)

# Return cluster assignments
labels.tolist()
        `);
        
        currentClusters = clusterLabels;
        
        // Calculate emotion disagreement per cluster
        if (mlStatus) mlStatus.textContent = 'Analyzing emotion patterns…';
        clusterDisagreement = calculateDisagreement(currentClusters);
        
        if (mlStatus) mlStatus.textContent = `Clustered ${dataset.length} objects`;
        showClusterView();
        
    } catch (error) {
        console.error('Clustering failed:', error);
        if (mlStatus) mlStatus.textContent = 'Clustering failed. Using fallback.';
        // Fallback to simple random clustering
        currentClusters = dataset.map(() => Math.floor(Math.random() * 6));
        clusterDisagreement = [0.4, 0.7, 0.3, 0.9, 0.2, 0.6];
        showClusterView();
    }
}

// Extract color features from images
async function extractImageFeatures(data) {
    const features = [];
    
    for (const item of data) {
        try {
            const colorFeatures = await getImageColorFeatures(item.imageURL);
            features.push(colorFeatures);
        } catch (e) {
            // If image fails to load, use default features
            features.push([128, 128, 128, 0.5, 0.5, 0.5]);
        }
    }
    
    return features;
}

// Extract color histogram features from an image
function getImageColorFeatures(imageURL) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Resize to small size for faster processing
            canvas.width = 50;
            canvas.height = 50;
            ctx.drawImage(img, 0, 0, 50, 50);
            
            const imageData = ctx.getImageData(0, 0, 50, 50).data;
            
            // Calculate average RGB and color variance
            let r = 0, g = 0, b = 0;
            let rVar = 0, gVar = 0, bVar = 0;
            const pixelCount = 50 * 50;
            
            // First pass: averages
            for (let i = 0; i < imageData.length; i += 4) {
                r += imageData[i];
                g += imageData[i + 1];
                b += imageData[i + 2];
            }
            r /= pixelCount;
            g /= pixelCount;
            b /= pixelCount;
            
            // Second pass: variance
            for (let i = 0; i < imageData.length; i += 4) {
                rVar += Math.pow(imageData[i] - r, 2);
                gVar += Math.pow(imageData[i + 1] - g, 2);
                bVar += Math.pow(imageData[i + 2] - b, 2);
            }
            rVar = Math.sqrt(rVar / pixelCount) / 255;
            gVar = Math.sqrt(gVar / pixelCount) / 255;
            bVar = Math.sqrt(bVar / pixelCount) / 255;
            
            // Return normalized features: [avg_r, avg_g, avg_b, var_r, var_g, var_b]
            resolve([r / 255, g / 255, b / 255, rVar, gVar, bVar]);
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imageURL;
    });
}

// Calculate emotion disagreement within each cluster
function calculateDisagreement(clusters) {
    const disagreement = [0, 0, 0, 0, 0, 0];
    
    for (let clusterIdx = 0; clusterIdx < 6; clusterIdx++) {
        const clusterEmotions = dataset
            .filter((_, i) => clusters[i] === clusterIdx)
            .map(item => item.emotion);
        
        if (clusterEmotions.length === 0) continue;
        
        // Count unique emotions in this cluster
        const uniqueEmotions = new Set(clusterEmotions);
        
        // Disagreement = (unique emotions - 1) / 5 (max possible is 6 emotions)
        // Higher score = more emotional diversity
        disagreement[clusterIdx] = (uniqueEmotions.size - 1) / 5;
    }
    
    return disagreement;
}

function showClusterView() {
    const statsEl = document.getElementById('clusterStats');
    const galleryEl = document.getElementById('clusterGallery');
    if (!statsEl || !galleryEl) return;

    statsEl.innerHTML = `
        <div class="section-label small">CLUSTER ANALYSIS</div>
        <h2>6 Visual Clusters (${dataset.length} ${dataset.length === 1 ? 'object' : 'objects'} in the dataset)</h2>
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

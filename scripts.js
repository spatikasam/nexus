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
        console.log('Visualization page detected, loading dataset and clustering...');
        syncDataset().then(() => {
            console.log('Dataset synced, starting clustering...');
            return runClustering();
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
    console.log('runClustering called, dataset length:', dataset.length);
    
    if (!dataset.length) {
        if (mlStatus) mlStatus.textContent = 'No data to analyse yet.';
        console.log('No dataset to cluster');
        return;
    }

    if (dataset.length < 6) {
        console.log('Dataset too small for clustering, using fallback');
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
        console.log('Clustering complete! Cluster assignments:', clusterLabels);
        
        // Calculate emotion disagreement per cluster
        if (mlStatus) mlStatus.textContent = 'Analyzing emotion patterns…';
        clusterDisagreement = calculateDisagreement(currentClusters);
        console.log('Disagreement scores:', clusterDisagreement);
        
        if (mlStatus) mlStatus.textContent = `Clustered ${dataset.length} objects`;
        showClusterView();
        console.log('Cluster view displayed');
        
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
            ${[0,1,2,3,4,5].map(i => {
                const clusterSize = dataset.filter((_, idx) => currentClusters[idx] === i).length;
                return `
                <div class="cluster-preview" onclick="zoomCluster(${i})">
                    <div class="cluster-glow" style="
                        box-shadow: 0 0 ${20 + 20 * (clusterDisagreement[i] || 0)}px 
                        rgba(255,255,255,${0.2 + 0.3 * (clusterDisagreement[i] || 0)});
                    "></div>
                    <div>Cluster ${i} (${clusterSize} ${clusterSize === 1 ? 'object' : 'objects'})</div>
                    <div class="cluster-score">${((clusterDisagreement[i] || 0) * 100).toFixed(0)}% chaos</div>
                </div>
            `}).join('')}
        </div>
    `;
    
    // Show all images in cluster view by default
    galleryEl.innerHTML = dataset
        .map((entry, i) => ({...entry, cluster: currentClusters[i]}))
        .map(img => `
            <button class="thumb cluster-thumb" onclick="zoomCluster(${img.cluster})" title="Cluster ${img.cluster}: ${img.emotion}">
                <img src="${img.imageURL}" alt="${img.filename}">
                <div class="emotion-overlay">
                    <div style="font-size: 0.75rem; opacity: 0.7;">Cluster ${img.cluster}</div>
                    <div>${img.emotion}</div>
                </div>
            </button>
        `).join('');
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

// EMOTION MEMORY PALACE CONSTELLATION (Add after runClustering)
let scene, camera, renderer, constellationGroup, stars = [];
const emotionMap = {
    anger: { pos: [-0.8, -0.2, 0], color: 0xff4b5c },
    fear: { pos: [-0.6, 0.2, 0], color: 0x6b5bff },
    disgust: { pos: [0.2, -0.8, 0], color: 0x46c37b },
    happiness: { pos: [0.8, 0.6, 0], color: 0xffd166 },
    sadness: { pos: [-0.3, -0.7, 0], color: 0x4d7cff },
    surprise: { pos: [0.5, 0.3, 0], color: 0xff66c4 }
};

// Initialize 3D Constellation Scene
function initConstellation() {
    const container = document.getElementById('constellationCanvas') || createConstellationContainer();
    
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020309);
    
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 5;
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);
    
    // Constellation container
    constellationGroup = new THREE.Group();
    scene.add(constellationGroup);
    
    // Background stars
    createStarField();
    
    // Orbit controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        updateConstellation();
        renderer.render(scene, camera);
    }
    animate();
    
    // Resize handler
    window.addEventListener('resize', onWindowResize);
    
    function onWindowResize() {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
    
    return container;
}

// Create constellation container if it doesn't exist
function createConstellationContainer() {
    const container = document.createElement('div');
    container.id = 'constellationContainer';
    container.style.cssText = `
        width: 100%; height: 600px; margin: 40px 0;
        position: relative; border-radius: 24px; overflow: hidden;
        background: radial-gradient(circle at center, rgba(30,30,43,0.95) 0%, rgba(2,3,9,1) 100%);
        box-shadow: 0 35px 80px rgba(0,0,0,0.5);
    `;
    const canvas = document.createElement('canvas');
    canvas.id = 'constellationCanvas';
    container.appendChild(canvas);
    
    // Add to DOM (after gallery)
    const gallerySection = document.querySelector('.gallery-section');
    if (gallerySection) {
        gallerySection.parentNode.insertBefore(container, gallerySection.nextSibling);
    } else {
        document.body.appendChild(container);
    }
    
    return container;
}

// Create background starfield
function createStarField() {
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 1000;
    const positions = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 200;
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2,
        sizeAttenuation: false
    });
    
    const starsField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starsField);
}

// Update constellation based on dataset + clusters
function updateConstellation() {
    if (!dataset.length || !constellationGroup) return;
    
    // Clear existing objects
    while (constellationGroup.children.length) {
        constellationGroup.remove(constellationGroup.children[0]);
    }
    
    // Group objects by emotion and create constellation nodes
    Object.entries(emotionMap).forEach(([emotion, { pos, color }]) => {
        const emotionObjects = dataset.filter(item => item.emotion === emotion);
        
        if (emotionObjects.length === 0) return;
        
        // Central emotion node (constellation center)
        const centerGeometry = new THREE.SphereGeometry(0.1 + emotionObjects.length * 0.01, 16, 16);
        const centerMaterial = new THREE.MeshBasicMaterial({ 
            color, 
            transparent: true, 
            opacity: 0.8 
        });
        const centerSphere = new THREE.Mesh(centerGeometry, centerMaterial);
        centerSphere.position.set(...pos);
        constellationGroup.add(centerSphere);
        
        // Orbiting object particles
        emotionObjects.slice(0, 8).forEach((obj, i) => { // Max 8 per emotion
            const particle = createObjectParticle(obj.imageURL || '', color, i);
            const angle = (i / 8) * Math.PI * 2;
            const radius = 0.3 + i * 0.05;
            particle.position.set(
                pos[0] + Math.cos(angle) * radius,
                pos[1] + Math.sin(angle) * radius * 0.5,
                pos[2] + (Math.random() - 0.5) * 0.2
            );
            constellationGroup.add(particle);
        });
        
        // Connecting lines (emotional gravity)
        const lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 });
        emotionObjects.slice(0, 4).forEach((obj, i) => {
            const points = [
                new THREE.Vector3(...pos),
                new THREE.Vector3(
                    pos[0] + Math.cos(i * Math.PI / 2) * 0.4,
                    pos[1] + Math.sin(i * Math.PI / 2) * 0.3,
                    pos[2]
                )
            ];
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
            constellationGroup.add(new THREE.Line(lineGeometry, lineMaterial));
        });
    });
    
    // Animate glow
    constellationGroup.traverse((child) => {
        if (child.material) {
            child.material.emissive = new THREE.Color(child.material.color).multiplyScalar(0.2 + Math.sin(Date.now() * 0.001 + child.position.x) * 0.1);
        }
    });
}

// Create particle representing an object
function createObjectParticle(imageURL, color, index) {
    const group = new THREE.Group();
    
    // Glowing particle
    const particleGeometry = new THREE.SphereGeometry(0.08, 12, 12);
    const particleMaterial = new THREE.MeshBasicMaterial({ 
        color, 
        transparent: true, 
        opacity: 0.9 
    });
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    
    // Glow effect
    const glowGeometry = new THREE.SphereGeometry(0.12, 12, 12);
    const glowMaterial = new THREE.MeshBasicMaterial({ 
        color, 
        transparent: true, 
        opacity: 0.3 
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    
    group.add(particle, glow);
    
    // Hover effect
    group.userData.originalScale = 1;
    group.onHover = () => {
        group.scale.set(1.5, 1.5, 1.5);
    };
    group.onHoverOut = () => {
        group.scale.set(1, 1, 1);
    };
    
    return group;
}

// Load Three.js and OrbitControls (add to index.html)
function loadThreeJS() {
    return new Promise((resolve) => {
        if (window.THREE) {
            resolve();
            return;
        }
        
        const script1 = document.createElement('script');
        script1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        script1.onload = () => {
            const script2 = document.createElement('script');
            script2.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
            script2.onload = resolve;
            document.head.appendChild(script2);
        };
        document.head.appendChild(script1);
    });
}

async function initMemoryPalace() {
    await loadThreeJS();
    const container = initConstellation();
    
    // Auto-update when dataset changes
    const observer = new MutationObserver(() => {
        if (dataset.length > 0) updateConstellation();
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
}

// Call after clustering
if (window.location.pathname.includes('visualisation.html')) {
    // Replace/add this in your runClustering success callback:
    initMemoryPalace().then(() => {
        updateConstellation();
    });
}


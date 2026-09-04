document.addEventListener("DOMContentLoaded", () => {
    // ============================================
    // 1. LIVE CLOCK UPDATER
    // ============================================
    function updateClock() {
        const clockText = document.getElementById("clock-text");
        if (!clockText) return;
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        clockText.textContent = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    
    updateClock();
    setInterval(updateClock, 1000);

    // ============================================
    // 2. ENGINE TOGGLE
    // ============================================
    const engineToggle = document.getElementById("engine-toggle");
    const engineStatusLabel = document.getElementById("engine-status-label");
    const engineStatusText = document.getElementById("engine-status-text");
    const cctvOverlay = document.getElementById("cctv-overlay");
    const cctvVideo = document.getElementById("cctv-video");
    const cctvCanvas = document.getElementById("cctv-canvas");
    
    // Image elements for toggle control
    const processedStream = document.getElementById("processed-stream");
    const uploadPlaceholder = document.getElementById("upload-placeholder");
    const metadataBar = document.getElementById("metadata-bar");
    const detectionsList = document.getElementById("detections-list");
    const detectionCountBadge = document.getElementById("detection-count-badge");
    
    // Store original and marked image URLs
    let originalImageUrl = null;
    let markedImageUrl = null;
    let lastProcessedData = null;
    
    let isEngineOn = true;
    let videoStream = null;
    let processingInterval = null;
    let frameCount = 0;
    let lastFpsUpdate = Date.now();
    
    // Function to update image display based on toggle state
    function updateImageDisplay() {
        if (!processedStream) return;
        
        if (isEngineOn) {
            // Engine ON - show marked/processed image with detections
            if (markedImageUrl) {
                processedStream.src = markedImageUrl;
                processedStream.style.display = "block";
                if (uploadPlaceholder) {
                    uploadPlaceholder.style.display = "none";
                }
            }
        } else {
            // Engine OFF - show original/static image without detections
            if (originalImageUrl) {
                processedStream.src = originalImageUrl;
                processedStream.style.display = "block";
                if (uploadPlaceholder) {
                    uploadPlaceholder.style.display = "none";
                }
            } else if (!processedStream.src) {
                // No image loaded yet
                if (uploadPlaceholder) {
                    uploadPlaceholder.style.display = "flex";
                }
            }
        }
    }
    
    if (engineToggle) {
        engineToggle.addEventListener("change", function() {
            isEngineOn = this.checked;
            if (isEngineOn) {
                engineStatusLabel.textContent = "ON";
                engineStatusLabel.style.color = "#4caf50";
                engineStatusText.textContent = "Active & Monitoring";
                document.querySelector('.overview-badge').innerHTML = '<span class="dot"></span>AI ACTIVE';
                startProcessing();
            } else {
                engineStatusLabel.textContent = "OFF";
                engineStatusLabel.style.color = "#ff1744";
                engineStatusText.textContent = "Paused";
                document.querySelector('.overview-badge').innerHTML = '<span class="dot" style="background: #ff1744;"></span>AI PAUSED';
                stopProcessing();
            }
            
            // Update image display when toggle changes
            updateImageDisplay();
        });
    }

    // ============================================
    // 3. CCTV HANDLING
    // ============================================
    const connectCctvBtn = document.getElementById("connect-cctv-btn");
    const cctvFileInput = document.getElementById("cctv-file-input");
    const cctvPlayBtn = document.getElementById("cctv-play-btn");
    const cctvFullscreenBtn = document.getElementById("cctv-fullscreen-btn");
    const cctvUploadBtn = document.getElementById("cctv-upload-btn");
    const cctvRefreshBtn = document.getElementById("cctv-refresh-btn");
    const cctvFpsDisplay = document.getElementById("cctv-fps");
    const cctvResolutionDisplay = document.getElementById("cctv-resolution");
    const cctvTimestamp = document.getElementById("cctv-timestamp");
    const cctvStatusBadge = document.getElementById("cctv-status-badge");
    
    let isPlaying = false;
    let frameInterval = null;
    
    // Connect CCTV (overlay button)
    if (connectCctvBtn) {
        connectCctvBtn.addEventListener("click", () => {
            cctvFileInput.click();
        });
    }
    
    // Upload button in CCTV controls
    if (cctvUploadBtn) {
        cctvUploadBtn.addEventListener("click", () => {
            cctvFileInput.click();
        });
    }
    
    // Refresh button - reload the current video
    if (cctvRefreshBtn) {
        cctvRefreshBtn.addEventListener("click", () => {
            if (cctvVideo && cctvVideo.src) {
                // Add rotating animation
                cctvRefreshBtn.classList.add('refreshing');
                
                // Store current source and reload
                const currentSrc = cctvVideo.src;
                cctvVideo.pause();
                cctvVideo.src = "";
                cctvVideo.load();
                
                // Show loading state
                cctvStatusBadge.innerHTML = '<span class="dot" style="background: #ffb020;"></span> REFRESHING';
                
                setTimeout(() => {
                    cctvVideo.src = currentSrc;
                    cctvVideo.load();
                    cctvVideo.play();
                    isPlaying = true;
                    cctvStatusBadge.innerHTML = '<span class="dot" style="background: #4caf50;"></span> LIVE';
                    
                    // Remove rotating animation
                    cctvRefreshBtn.classList.remove('refreshing');
                    
                    if (isEngineOn) {
                        startProcessing();
                    }
                }, 500);
            } else {
                // No video loaded, prompt upload
                cctvFileInput.click();
            }
        });
    }
    
    // Handle file selection
    if (cctvFileInput) {
        cctvFileInput.addEventListener("change", function(e) {
            const file = this.files[0];
            if (file) {
                // Check if it's a video file
                if (file.type.startsWith('video/')) {
                    const url = URL.createObjectURL(file);
                    loadVideoStream(url);
                } else {
                    alert("Please select a video file (MP4, WebM, etc.)");
                }
            }
        });
    }
    
    function loadVideoStream(url) {
        if (cctvVideo) {
            cctvVideo.src = url;
            cctvVideo.style.display = "block";
            cctvCanvas.style.display = "block";
            cctvOverlay.style.display = "none";
            
            cctvVideo.addEventListener('loadedmetadata', () => {
                cctvVideo.play();
                isPlaying = true;
                cctvStatusBadge.innerHTML = '<span class="dot" style="background: #4caf50;"></span> LIVE';
                cctvResolutionDisplay.textContent = `${cctvVideo.videoWidth}x${cctvVideo.videoHeight}`;
                
                if (isEngineOn) {
                    startProcessing();
                }
            });
        }
    }
    
    // Play/Pause
    if (cctvPlayBtn) {
        cctvPlayBtn.addEventListener("click", () => {
            if (cctvVideo) {
                if (isPlaying) {
                    cctvVideo.pause();
                    isPlaying = false;
                    cctvStatusBadge.innerHTML = '<span class="dot" style="background: #ffb020;"></span> PAUSED';
                } else {
                    cctvVideo.play();
                    isPlaying = true;
                    cctvStatusBadge.innerHTML = '<span class="dot" style="background: #4caf50;"></span> LIVE';
                }
            }
        });
    }
    
    // Fullscreen
    if (cctvFullscreenBtn) {
        cctvFullscreenBtn.addEventListener("click", () => {
            const container = document.getElementById("cctv-viewport");
            if (container) {
                if (!document.fullscreenElement) {
                    container.requestFullscreen();
                } else {
                    document.exitFullscreen();
                }
            }
        });
    }
    
    // Update timestamp on video
    if (cctvVideo) {
        cctvVideo.addEventListener('timeupdate', () => {
            const time = cctvVideo.currentTime;
            const hours = String(Math.floor(time / 3600)).padStart(2, '0');
            const minutes = String(Math.floor((time % 3600) / 60)).padStart(2, '0');
            const seconds = String(Math.floor(time % 60)).padStart(2, '0');
            if (cctvTimestamp) {
                cctvTimestamp.textContent = `${hours}:${minutes}:${seconds}`;
            }
        });
    }

    // ============================================
    // 4. VIDEO PROCESSING (YOLO)
    // ============================================
    
    // ✅ Production URL (Google Cloud)
    const API_URL = "https://pythonengine-196922836719.asia-south1.run.app/api/process-image";
    // ✅ Local fallback
    const API_URL_LOCAL = "http://localhost:8000/api/process-image";

    const fileInput = document.getElementById("file-input");
    const loadingBarContainer = document.getElementById("loading-bar-container");
    const loadingBarFill = document.getElementById("loading-bar-fill");
    const uploadStatusText = document.getElementById("upload-status-text");
    const uploadSubtext = document.getElementById("upload-subtext");

    async function processFrame(imageData) {
        if (!isEngineOn) return;
        
        try {
            const formData = new FormData();
            formData.append("file", imageData);
            
            const response = await fetch(API_URL, {
                method: "POST",
                body: formData
            });
            
            if (!response.ok) throw new Error("Processing failed");
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error("Frame processing error:", error);
            return null;
        }
    }

    function startProcessing() {
        if (processingInterval) return;
        
        processingInterval = setInterval(() => {
            if (!isEngineOn || !cctvVideo || cctvVideo.paused || !cctvVideo.src) {
                return;
            }
            
            // Capture frame from video
            const canvas = document.createElement('canvas');
            canvas.width = cctvVideo.videoWidth || 640;
            canvas.height = cctvVideo.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(cctvVideo, 0, 0, canvas.width, canvas.height);
            
            // Convert to blob for processing
            canvas.toBlob(async (blob) => {
                if (!blob) return;
                
                const file = new File([blob], `frame_${Date.now()}.jpg`, { type: 'image/jpeg' });
                const formData = new FormData();
                formData.append("file", file);
                
                try {
                    const response = await fetch(API_URL, {
                        method: "POST",
                        body: formData
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        // Update detections
                        renderResults(data);
                        
                        // Update FPS
                        frameCount++;
                        const now = Date.now();
                        if (now - lastFpsUpdate > 1000) {
                            cctvFpsDisplay.textContent = `${frameCount} FPS`;
                            frameCount = 0;
                            lastFpsUpdate = now;
                        }
                    }
                } catch (error) {
                    console.error("Frame processing error:", error);
                }
            }, 'image/jpeg', 0.8);
            
        }, 1000); // Process every second
    }

    function stopProcessing() {
        if (processingInterval) {
            clearInterval(processingInterval);
            processingInterval = null;
        }
    }

    // ============================================
    // 5. IMAGE COMPRESSION & UPLOAD HANDLING
    // ============================================
    
    // ✅ Compress image in Browser before uploading (REDUCES SIZE BY 90%!)
    function compressImage(file, maxWidth = 800, quality = 0.7) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const scale = Math.min(1, maxWidth / img.width);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    
                    // Convert to compressed JPEG (quality 0.7 = 70%)
                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                // Create a new File from the compressed blob
                                const compressedFile = new File([blob], file.name, {
                                    type: 'image/jpeg',
                                    lastModified: Date.now()
                                });
                                resolve(compressedFile);
                            } else {
                                reject(new Error('Canvas compression failed'));
                            }
                        },
                        'image/jpeg',
                        quality
                    );
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    }

    if (fileInput) {
        fileInput.addEventListener("change", async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            // ✅ Compress the image first (Reduces upload size from 12MB to 200KB)
            showLoadingState(true, "🖼️ Compressing image...");
            
            try {
                const compressedFile = await compressImage(file, 800, 0.7);
                
                // Store the original image URL for toggle functionality
                originalImageUrl = URL.createObjectURL(file);

                const formData = new FormData();
                formData.append("file", compressedFile); // ✅ Upload compressed file

                showLoadingState(true, "🔍 Analyzing with YOLOv8...");

                // Try Production URL first, then fallback to local
                const urls = [API_URL, API_URL_LOCAL];
                
                for (const url of urls) {
                    try {
                        setProgressBar(35);

                        const response = await fetch(url, {
                            method: "POST",
                            body: formData
                        });

                        setProgressBar(80);

                        if (!response.ok) {
                            continue; // Try next URL
                        }

                        const data = await response.json();
                        setProgressBar(100);

                        if (data.status === "success") {
                            // Store marked image URL
                            markedImageUrl = data.images?.marked || null;
                            lastProcessedData = data;
                            
                            setTimeout(() => {
                                renderResults(data);
                                showLoadingState(false, "✅ Analysis Complete");
                                
                                if (data.metadata && data.metadata.timestamp) {
                                    const clockText = document.getElementById("clock-text");
                                    if (clockText) {
                                        clockText.textContent = data.metadata.timestamp;
                                    }
                                }
                                
                                // After processing, show the appropriate image based on toggle state
                                updateImageDisplay();
                            }, 300);
                            
                            return; // ✅ Success, exit loop
                        }
                    } catch (error) {
                        console.error(`Upload failed to ${url}:`, error);
                    }
                }

                // If all URLs fail
                alert("❌ Error: Failed to fetch. Please make sure your backend is running.");
                showLoadingState(false, "Upload CCTV Frame or Stream");
                
            } catch (error) {
                console.error("Image compression error:", error);
                alert("❌ Error compressing image.");
                showLoadingState(false, "Upload CCTV Frame or Stream");
            }
        });
    }

    // Drag and drop support
    const viewportContainer = document.getElementById("image-viewport-container");
    if (viewportContainer) {
        viewportContainer.addEventListener("dragover", (e) => {
            e.preventDefault();
            viewportContainer.style.borderColor = "var(--accent)";
        });
        
        viewportContainer.addEventListener("dragleave", () => {
            viewportContainer.style.borderColor = "var(--border)";
        });
        
        viewportContainer.addEventListener("drop", async (e) => {
            e.preventDefault();
            viewportContainer.style.borderColor = "var(--border)";
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                fileInput.files = files;
                fileInput.dispatchEvent(new Event('change'));
            }
        });
    }

    function showLoadingState(isLoading, message) {
        if (loadingBarContainer) {
            loadingBarContainer.style.display = isLoading ? "block" : "none";
        }
        if (uploadStatusText) {
            uploadStatusText.textContent = message;
        }
        if (uploadSubtext) {
            uploadSubtext.style.display = isLoading ? "none" : "block";
        }
        if (isLoading) {
            setProgressBar(10);
        }
    }

    function setProgressBar(percentage) {
        if (loadingBarFill) {
            loadingBarFill.style.width = `${percentage}%`;
        }
    }

    // ============================================
    // 6. RISK COLOR CODING
    // ============================================
    function getRiskColor(riskLevel) {
        const risk = String(riskLevel).toLowerCase().trim();
        
        if (risk === 'high' || risk === 'critical' || risk === 'danger') {
            return {
                borderColor: '#ff1744',
                bgColor: 'rgba(255, 23, 68, 0.12)',
                pillColor: '#ff1744',
                pillBg: 'rgba(255, 23, 68, 0.15)',
                pillText: '#ffb4b4',
                label: '🔴 HIGH RISK'
            };
        } else if (risk === 'medium' || risk === 'moderate' || risk === 'warn') {
            return {
                borderColor: '#ffb020',
                bgColor: 'rgba(255, 176, 32, 0.12)',
                pillColor: '#ffb020',
                pillBg: 'rgba(255, 176, 32, 0.15)',
                pillText: '#ffe0a0',
                label: '🟡 MEDIUM'
            };
        } else if (risk === 'low' || risk === 'minor') {
            return {
                borderColor: '#4caf50',
                bgColor: 'rgba(76, 175, 80, 0.12)',
                pillColor: '#4caf50',
                pillBg: 'rgba(76, 175, 80, 0.15)',
                pillText: '#a5d6a7',
                label: '🟢 LOW'
            };
        } else if (risk === 'compliant' || risk === 'safe' || risk === 'clear') {
            return {
                borderColor: '#2196f3',
                bgColor: 'rgba(33, 150, 243, 0.12)',
                pillColor: '#2196f3',
                pillBg: 'rgba(33, 150, 243, 0.15)',
                pillText: '#90caf9',
                label: '🔵 COMPLIANT'
            };
        } else {
            return {
                borderColor: '#9aa6b8',
                bgColor: 'rgba(154, 166, 184, 0.08)',
                pillColor: '#9aa6b8',
                pillBg: 'rgba(154, 166, 184, 0.1)',
                pillText: '#cbd5e1',
                label: '⚪ UNKNOWN'
            };
        }
    }

    // ============================================
    // 7. RENDER RESULTS
    // ============================================
    function renderResults(data) {
        if (detectionCountBadge) {
            const total = data.total_errors || data.hazards?.length || 0;
            detectionCountBadge.textContent = `${total} Hazards`;
        }

        // Show the marked image if engine is ON
        if (isEngineOn && data.images && data.images.marked) {
            markedImageUrl = data.images.marked;
            processedStream.src = markedImageUrl;
            processedStream.style.display = "block";
            
            if (uploadPlaceholder) {
                uploadPlaceholder.style.display = "none";
            }
        }

        if (data.metadata) {
            if (metadataBar) {
                metadataBar.style.display = "flex";
                metadataBar.innerHTML = `
                    <span>📏 <b>${data.metadata.dimensions || 'N/A'}</b></span>
                    <span>📐 <b>${data.metadata.aspect_ratio || 'N/A'}</b></span>
                    <span>💡 <b>${data.metadata.brightness || 'N/A'}</b></span>
                    <span>📷 <b>${data.metadata.camera_make || 'Unknown'}</b></span>
                    <span>🕐 <b>${data.metadata.timestamp || 'N/A'}</b></span>
                `;
            }
            
            if (data.metadata.timestamp) {
                const clockText = document.getElementById("clock-text");
                if (clockText) {
                    clockText.textContent = data.metadata.timestamp;
                }
            }
        }

        if (detectionsList) {
            detectionsList.innerHTML = "";
            const hazards = data.hazards || [];
            
            if (hazards.length === 0) {
                detectionsList.innerHTML = `
                    <div class="empty-state" style="padding: 40px 0;">
                        <svg class="icon" style="width: 48px; height: 48px; color: #4caf50;">
                            <use href="#i-shield-check"/>
                        </svg>
                        <p style="color: #4caf50; font-size: 1.1rem; font-weight: 600;">✅ No hazards detected. Workplace is safe!</p>
                    </div>`;
                return;
            }

            const riskOrder = { 'high': 0, 'medium': 1, 'low': 2, 'compliant': 3, 'safe': 4 };
            hazards.sort((a, b) => {
                const riskA = String(a.risk_level || '').toLowerCase();
                const riskB = String(b.risk_level || '').toLowerCase();
                return (riskOrder[riskA] ?? 5) - (riskOrder[riskB] ?? 5);
            });

            const highCount = hazards.filter(h => String(h.risk_level || '').toLowerCase() === 'high').length;
            const mediumCount = hazards.filter(h => String(h.risk_level || '').toLowerCase() === 'medium').length;
            const lowCount = hazards.filter(h => String(h.risk_level || '').toLowerCase() === 'low').length;
            const compliantCount = hazards.filter(h => 
                ['compliant', 'safe', 'clear'].includes(String(h.risk_level || '').toLowerCase())
            ).length;

            if (highCount > 0 || mediumCount > 0 || lowCount > 0) {
                const summaryDiv = document.createElement("div");
                summaryDiv.style.cssText = `
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    padding: 10px 14px;
                    margin-bottom: 12px;
                    border-radius: 10px;
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid var(--border);
                    font-size: 0.8rem;
                    align-items: center;
                `;
                
                let summaryHTML = '<span style="font-weight: 600; color: var(--text);">📊 Risk Summary:</span>';
                if (highCount > 0) {
                    summaryHTML += `<span style="color: #ff1744;">🔴 ${highCount} High</span>`;
                }
                if (mediumCount > 0) {
                    summaryHTML += `<span style="color: #ffb020;">🟡 ${mediumCount} Medium</span>`;
                }
                if (lowCount > 0) {
                    summaryHTML += `<span style="color: #4caf50;">🟢 ${lowCount} Low</span>`;
                }
                if (compliantCount > 0) {
                    summaryHTML += `<span style="color: #2196f3;">🔵 ${compliantCount} Compliant</span>`;
                }
                summaryHTML += `<span style="color: var(--muted); margin-left: auto;">Total: ${hazards.length}</span>`;
                
                summaryDiv.innerHTML = summaryHTML;
                detectionsList.appendChild(summaryDiv);
            }

            hazards.forEach((hazard, index) => {
                const riskLevel = hazard.risk_level || 'high';
                const colors = getRiskColor(riskLevel);
                
                const item = document.createElement("div");
                item.className = "hazard-item";
                item.style.borderLeft = `4px solid ${colors.borderColor}`;
                item.style.background = colors.bgColor;
                item.style.animationDelay = `${index * 0.05}s`;
                
                let hazardIcon = '⚠️';
                const nameLower = String(hazard.hazard_name || '').toLowerCase();
                if (nameLower.includes('hardhat') || nameLower.includes('helmet')) {
                    hazardIcon = '⛑️';
                } else if (nameLower.includes('vest') || nameLower.includes('visibility')) {
                    hazardIcon = '🦺';
                } else if (nameLower.includes('glove')) {
                    hazardIcon = '🧤';
                } else if (nameLower.includes('height') || nameLower.includes('fall')) {
                    hazardIcon = '📏';
                } else if (nameLower.includes('equipment') || nameLower.includes('machinery')) {
                    hazardIcon = '🏗️';
                } else if (nameLower.includes('compliant') || nameLower.includes('safe')) {
                    hazardIcon = '✅';
                }

                const errorIndex = hazard.error_index || index + 1;
                const hazardName = hazard.hazard_name || 'Unknown Hazard';
                const confidence = (hazard.confidence || 0) * 100;
                const bbox = hazard.bbox || [0, 0, 0, 0];

                item.innerHTML = `
                    <div style="flex: 1; min-width: 0;">
                        <div class="hazard-name" style="color: ${colors.borderColor};">
                            ${hazardIcon} Error #${errorIndex}: ${hazardName}
                        </div>
                        <div class="hazard-sub">
                            <span>Conf: ${confidence.toFixed(1)}%</span>
                            <span>BBox: [${bbox.join(", ")}]</span>
                        </div>
                    </div>
                    <span class="pill-high" style="
                        background: ${colors.pillBg};
                        color: ${colors.pillText};
                        border: 1px solid ${colors.pillColor};
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 0.7rem;
                        font-weight: 700;
                        letter-spacing: 0.05em;
                        white-space: nowrap;
                    ">
                        ${colors.label}
                    </span>
                `;
                
                detectionsList.appendChild(item);
            });
        }
    }
});

// ============================================
// 8. STYLES
// ============================================
const style = document.createElement('style');
style.textContent = `
    /* Engine Toggle */
    .engine-toggle-container {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 16px;
        padding: 12px 20px;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }
    
    .engine-toggle-wrapper {
        display: flex;
        align-items: center;
        gap: 14px;
    }
    
    .engine-label {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text);
    }
    
    .toggle-switch {
        position: relative;
        width: 50px;
        height: 28px;
        cursor: pointer;
    }
    
    .toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }
    
    .toggle-slider {
        position: absolute;
        inset: 0;
        background: #ff1744;
        border-radius: 34px;
        transition: 0.3s;
    }
    
    .toggle-slider:before {
        content: "";
        position: absolute;
        height: 20px;
        width: 20px;
        left: 4px;
        bottom: 4px;
        background: white;
        border-radius: 50%;
        transition: 0.3s;
    }
    
    .toggle-switch input:checked + .toggle-slider {
        background: #4caf50;
    }
    
    .toggle-switch input:checked + .toggle-slider:before {
        transform: translateX(22px);
    }
    
    .engine-status {
        font-size: 0.85rem;
        font-weight: 700;
        color: #4caf50;
        min-width: 30px;
    }

    /* CCTV Section */
    .cctv-container {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    
    .cctv-viewport {
        position: relative;
        width: 100%;
        background: var(--ink-2);
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid var(--border);
        aspect-ratio: 16/9;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .cctv-viewport video,
    .cctv-viewport canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
    
    .cctv-viewport canvas {
        z-index: 2;
        pointer-events: none;
    }
    
    .cctv-viewport video {
        z-index: 1;
    }
    
    .cctv-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        background: rgba(3, 4, 10, 0.9);
        z-index: 3;
        padding: 24px;
        text-align: center;
    }
    
    .cctv-overlay h4 {
        color: var(--text);
        font-size: 1.1rem;
        margin: 0;
    }
    
    .cctv-overlay p {
        color: var(--muted);
        font-size: 0.85rem;
        margin: 0;
    }
    
    .cctv-timestamp {
        position: absolute;
        bottom: 16px;
        right: 16px;
        z-index: 4;
        padding: 6px 12px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 6px;
        color: var(--accent);
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.8rem;
        backdrop-filter: blur(4px);
        border: 1px solid rgba(180, 255, 58, 0.2);
    }
    
    .cctv-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--panel-2);
        border-radius: 10px;
        border: 1px solid var(--border);
    }
    
    .cctv-control-group {
        display: flex;
        gap: 8px;
    }
    
    .cctv-control-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--panel);
        color: var(--text);
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .cctv-control-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: var(--accent);
    }
    
    .cctv-control-btn .icon {
        width: 18px;
        height: 18px;
    }
    
    .cctv-status {
        display: flex;
        gap: 16px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.75rem;
        color: var(--muted);
    }
    
    .cctv-status span {
        background: var(--panel);
        padding: 4px 10px;
        border-radius: 4px;
    }

    /* Emergency Modal */
    .emergency-modal {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
        z-index: 1000;
    }
    
    .emergency-modal-content {
        background: var(--ink);
        border: 1px solid rgba(255, 23, 68, 0.3);
        border-radius: 20px;
        max-width: 480px;
        width: 90%;
        padding: 32px;
        box-shadow: 0 20px 60px rgba(255, 23, 68, 0.2);
        animation: fadeIn 0.3s ease;
    }
    
    .emergency-modal-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
    }
    
    .emergency-modal-header h2 {
        color: #ff1744;
        font-size: 1.3rem;
        margin: 0;
    }
    
    .emergency-badge {
        background: rgba(255, 23, 68, 0.15);
        color: #ff1744;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 0.7rem;
        font-weight: 700;
        border: 1px solid rgba(255, 23, 68, 0.3);
        margin-left: auto;
    }
    
    .emergency-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
    
    .emergency-input-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    
    .emergency-input-group label {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text);
    }
    
    .emergency-input {
        padding: 10px 14px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--panel);
        color: var(--text);
        font-size: 0.9rem;
        transition: border-color 0.2s;
    }
    
    .emergency-input:focus {
        outline: none;
        border-color: var(--accent);
    }
    
    .emergency-error {
        color: #ff1744;
        font-size: 0.85rem;
        padding: 8px;
        background: rgba(255, 23, 68, 0.1);
        border-radius: 8px;
        border: 1px solid rgba(255, 23, 68, 0.2);
    }
    
    .emergency-modal-footer {
        display: flex;
        gap: 12px;
        margin-top: 24px;
        justify-content: flex-end;
    }
    
    .emergency-btn-cancel,
    .emergency-btn-confirm {
        padding: 10px 20px;
        border-radius: 10px;
        border: none;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .emergency-btn-cancel {
        background: var(--panel);
        color: var(--text);
        border: 1px solid var(--border);
    }
    
    .emergency-btn-cancel:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    
    .emergency-btn-confirm {
        background: #ff1744;
        color: white;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .emergency-btn-confirm:hover {
        background: #d50000;
        transform: scale(1.02);
    }

    /* Lockout Overlay */
    .lockout-overlay {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(12px);
        z-index: 2000;
    }
    
    .lockout-content {
        text-align: center;
        padding: 40px;
        max-width: 500px;
    }
    
    .lockout-content h2 {
        color: #ff1744;
        font-size: 2rem;
        margin: 20px 0 12px;
    }
    
    .lockout-content p {
        color: var(--muted);
        font-size: 1rem;
        margin-bottom: 24px;
    }
    
    .lockout-timer {
        font-family: 'JetBrains Mono', monospace;
        font-size: 3rem;
        color: var(--accent);
        margin: 24px 0;
        padding: 20px;
        border: 1px solid rgba(180, 255, 58, 0.2);
        border-radius: 12px;
        background: rgba(180, 255, 58, 0.05);
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }
`;
document.head.appendChild(style);
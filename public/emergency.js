// Emergency lockout controls - Instant lock, credential unlock with JSON logging
// Now stores logs both locally and on the server

let isLocked = false;
let lockoutTimer = null;
let lockoutSeconds = 0;
let lockStartTime = null;
let unlockTime = null;

// API URL for backend
const API_URL = 'http://localhost:3000/api';

// Store captured snapshots
let capturedSnapshots = [];
let mediaRecorder = null;
let recordedChunks = [];

// Admin credentials for unlocking
const ADMIN_CREDENTIALS = {
    adminId: 'SAFEGUARD_ADMIN',
    password: 'SAFEGUARD@2024'
};

// Check if system was locked before page refresh
function checkLockState() {
    const savedState = localStorage.getItem('emergency_lock_state');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            if (state.isLocked) {
                isLocked = true;
                lockStartTime = state.lockStartTime;
                lockoutSeconds = Math.floor((Date.now() - state.lockStartTime) / 1000);
                
                const overlay = document.getElementById("lockout-overlay");
                if (overlay) {
                    overlay.style.display = "flex";
                }
                
                const engineToggle = document.getElementById("engine-toggle");
                if (engineToggle) {
                    engineToggle.checked = false;
                    engineToggle.dispatchEvent(new Event('change'));
                }
                
                const engineStatusText = document.getElementById("engine-status-text");
                if (engineStatusText) {
                    engineStatusText.textContent = "🔒 LOCKED - Emergency";
                    engineStatusText.style.color = "#ff1744";
                }
                
                if (lockoutTimer) clearInterval(lockoutTimer);
                lockoutTimer = setInterval(updateLockoutTimer, 1000);
                updateLockoutTimer();
                
                showNotification("🔒 System is locked from previous session!", "danger");
            }
        } catch (e) {
            console.error("Error restoring lock state:", e);
        }
    }
}

// ============================================
// SNAPSHOT CAPTURE FUNCTIONS
// ============================================

// Capture snapshot from CCTV or uploaded image
function captureSnapshot() {
    const video = document.getElementById("cctv-video");
    const processedImage = document.getElementById("processed-stream");
    let snapshotData = null;
    let mediaType = 'none';
    let sourceType = 'unknown';
    
    // Try to capture from CCTV video first
    if (video && video.src && video.readyState >= 2) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            snapshotData = canvas.toDataURL('image/jpeg', 0.9);
            mediaType = 'image';
            sourceType = 'cctv';
            console.log("📸 Snapshot captured from CCTV");
        } catch (e) {
            console.error("Error capturing from CCTV:", e);
        }
    }
    
    // If no CCTV snapshot, try from processed image
    if (!snapshotData && processedImage && processedImage.src && processedImage.src !== '') {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = processedImage.naturalWidth || 640;
            canvas.height = processedImage.naturalHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(processedImage, 0, 0, canvas.width, canvas.height);
            snapshotData = canvas.toDataURL('image/jpeg', 0.9);
            mediaType = 'image';
            sourceType = 'uploaded_image';
            console.log("📸 Snapshot captured from uploaded image");
        } catch (e) {
            console.error("Error capturing from uploaded image:", e);
        }
    }
    
    // If still no snapshot, try to capture from the viewport container
    if (!snapshotData) {
        const viewport = document.getElementById("image-viewport-container");
        if (viewport) {
            try {
                const img = viewport.querySelector('img');
                if (img && img.src && img.src !== '') {
                    snapshotData = img.src;
                    mediaType = 'image';
                    sourceType = 'viewport';
                    console.log("📸 Snapshot captured from viewport");
                }
            } catch (e) {
                console.error("Error capturing from viewport:", e);
            }
        }
    }
    
    return { data: snapshotData, type: mediaType, source: sourceType };
}

// Record short video clip from CCTV (5-8 seconds)
function recordVideoClip() {
    const video = document.getElementById("cctv-video");
    if (!video || !video.src || video.readyState < 2) {
        showNotification("⚠️ No video source available for recording.", "danger");
        return null;
    }
    
    return new Promise((resolve) => {
        try {
            const stream = video.captureStream ? video.captureStream() : null;
            if (!stream) {
                showNotification("⚠️ Video recording not supported in this browser.", "danger");
                resolve(null);
                return;
            }
            
            recordedChunks = [];
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9,opus',
                videoBitsPerSecond: 2500000
            });
            
            mediaRecorder.ondataavailable = function(event) {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = function() {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const reader = new FileReader();
                reader.onload = function() {
                    const base64Data = reader.result;
                    recordedChunks = [];
                    resolve({
                        data: base64Data,
                        type: 'video',
                        source: 'cctv_recording',
                        duration: (Date.now() - recordingStartTime) / 1000,
                        blob: blob,
                        url: url
                    });
                };
                reader.readAsDataURL(blob);
            };
            
            let recordingStartTime = Date.now();
            mediaRecorder.start();
            
            const recordDuration = Math.min(Math.max(5, 8), 8);
            setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }, recordDuration * 1000);
            
            showNotification(`🎥 Recording video clip (${recordDuration}s)...`, "info");
            
        } catch (e) {
            console.error("Error recording video:", e);
            showNotification("⚠️ Error recording video.", "danger");
            resolve(null);
        }
    });
}

// ============================================
// MAIN EMERGENCY FUNCTIONS
// ============================================

// Make functions globally accessible
window.triggerEmergencyLock = function() {
    captureAndLogMedia();
    triggerLockdown();
};

// Capture media and log it
async function captureAndLogMedia() {
    console.log("📸 Capturing media for emergency log...");
    
    let mediaEntry = {
        media_type: 'none',
        source: 'none',
        data: null
    };
    
    const snapshot = captureSnapshot();
    if (snapshot && snapshot.data) {
        mediaEntry.data = snapshot.data;
        mediaEntry.media_type = 'image';
        mediaEntry.source = snapshot.source;
        console.log("✅ Snapshot captured");
    }
    
    if (!mediaEntry.data) {
        const video = document.getElementById("cctv-video");
        if (video && video.src && video.readyState >= 2) {
            const videoClip = await recordVideoClip();
            if (videoClip && videoClip.data) {
                mediaEntry.data = videoClip.data;
                mediaEntry.media_type = 'video';
                mediaEntry.source = 'cctv_recording';
                mediaEntry.duration = videoClip.duration || 0;
                console.log("✅ Video clip captured");
            }
        }
    }
    
    if (!mediaEntry.data) {
        mediaEntry.media_type = 'none';
        mediaEntry.source = 'no_media_available';
        mediaEntry.data = null;
        console.log("ℹ️ No media available");
    }
    
    return mediaEntry;
}

// Save to server
async function saveToServer(eventType, adminId, mediaEntry, duration) {
    try {
        const response = await fetch(`${API_URL}/emergency/log`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                event_type: eventType,
                admin_id: adminId || 'SYSTEM',
                media_data: mediaEntry?.data || null,
                media_type: mediaEntry?.media_type || 'none',
                source: mediaEntry?.source || 'unknown',
                duration_seconds: duration || 0,
                engine_status: document.getElementById("engine-toggle")?.checked ? 'ON' : 'OFF',
                active_hazards: document.querySelectorAll('.hazard-item').length || 0
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log(`✅ Event logged to server: ${eventType}`);
            return result;
        } else {
            console.error('Failed to save to server:', await response.text());
            return null;
        }
    } catch (error) {
        console.error('Error saving to server:', error);
        return null;
    }
}

// Open unlock with custom prompt
window.openEmergencyModal = function() {
    console.log("Opening emergency unlock...");
    
    if (!isLocked) {
        triggerLockdown();
        return;
    }
    
    const adminId = prompt("👤 Enter Admin ID:");
    if (adminId === null) return;
    
    const password = prompt("🔑 Enter Password:");
    if (password === null) return;
    
    if (adminId === ADMIN_CREDENTIALS.adminId && password === ADMIN_CREDENTIALS.password) {
        performUnlock(adminId);
    } else {
        showNotification("❌ Invalid credentials. Please try again.", "danger");
        setTimeout(() => {
            if (isLocked) {
                window.openEmergencyModal();
            }
        }, 1000);
    }
};

function triggerLockdown() {
    isLocked = true;
    lockStartTime = Date.now();
    lockoutSeconds = 0;
    
    const lockState = {
        isLocked: true,
        lockStartTime: lockStartTime
    };
    localStorage.setItem('emergency_lock_state', JSON.stringify(lockState));
    
    // Save to server
    const mediaEntry = captureSnapshot();
    saveToServer('LOCKED', null, mediaEntry, 0);
    
    // Also save locally
    logLockEvent('LOCKED', null);
    
    const overlay = document.getElementById("lockout-overlay");
    if (overlay) {
        overlay.style.display = "flex";
    }
    
    const engineToggle = document.getElementById("engine-toggle");
    if (engineToggle) {
        engineToggle.checked = false;
        engineToggle.dispatchEvent(new Event('change'));
    }
    
    const engineStatusText = document.getElementById("engine-status-text");
    if (engineStatusText) {
        engineStatusText.textContent = "🔒 LOCKED - Emergency";
        engineStatusText.style.color = "#ff1744";
    }
    
    document.querySelectorAll('.engine-status-text').forEach(el => {
        el.textContent = "🔒 LOCKED - Emergency";
        el.style.color = "#ff1744";
    });
    
    if (lockoutTimer) clearInterval(lockoutTimer);
    lockoutTimer = setInterval(updateLockoutTimer, 1000);
    updateLockoutTimer();
    
    console.log("🚨 EMERGENCY LOCKOUT ACTIVATED!");
    showNotification("🚨 EMERGENCY LOCKOUT ACTIVATED!", "danger");
}

function updateLockoutTimer() {
    lockoutSeconds++;
    const minutes = String(Math.floor(lockoutSeconds / 60)).padStart(2, '0');
    const seconds = String(lockoutSeconds % 60).padStart(2, '0');
    const timerEl = document.getElementById("lockout-countdown");
    if (timerEl) {
        timerEl.textContent = `${minutes}:${seconds}`;
    }
}

function performUnlock(adminId) {
    unlockTime = Date.now();
    const duration = Math.floor((unlockTime - lockStartTime) / 1000);
    isLocked = false;
    
    localStorage.removeItem('emergency_lock_state');
    
    // Save to server
    saveToServer('UNLOCKED', adminId, null, duration);
    
    // Also save locally
    logLockEvent('UNLOCKED', adminId);
    
    const overlay = document.getElementById("lockout-overlay");
    if (overlay) {
        overlay.style.display = "none";
    }
    
    const engineToggle = document.getElementById("engine-toggle");
    if (engineToggle) {
        engineToggle.checked = true;
        engineToggle.dispatchEvent(new Event('change'));
    }
    
    const engineStatusText = document.getElementById("engine-status-text");
    if (engineStatusText) {
        engineStatusText.textContent = "Active & Monitoring";
        engineStatusText.style.color = "";
    }
    
    document.querySelectorAll('.engine-status-text').forEach(el => {
        el.textContent = "Active & Monitoring";
        el.style.color = "";
    });
    
    if (lockoutTimer) {
        clearInterval(lockoutTimer);
        lockoutTimer = null;
    }
    
    console.log("🔓 System unlocked successfully!");
    showNotification(`✅ System unlocked by ${adminId}!`, "success");
    
    lockStartTime = null;
    unlockTime = null;
}

function logLockEvent(eventType, adminId) {
    const logEntry = {
        id: `LOCK_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        event: eventType,
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleString(),
        adminId: adminId || 'SYSTEM',
        duration_seconds: eventType === 'UNLOCKED' ? Math.floor((Date.now() - lockStartTime) / 1000) : 0,
        system_state: {
            locked: eventType === 'LOCKED',
            engine_status: document.getElementById("engine-toggle")?.checked ? 'ON' : 'OFF',
            active_hazards: document.querySelectorAll('.hazard-item').length || 0
        }
    };
    
    let logs = [];
    try {
        const existingLogs = localStorage.getItem('emergency_logs');
        if (existingLogs) {
            logs = JSON.parse(existingLogs);
        }
    } catch (e) {
        console.error("Error reading logs:", e);
    }
    
    logs.push(logEntry);
    if (logs.length > 100) {
        logs = logs.slice(-100);
    }
    localStorage.setItem('emergency_logs', JSON.stringify(logs));
    console.log(`📝 ${eventType} event logged locally:`, logEntry);
}

// ============================================
// VIEW LOGS FUNCTIONS
// ============================================

// View Emergency Logs (lock/unlock events)
window.viewEmergencyLogs = function() {
    console.log("📋 Viewing emergency logs...");
    try {
        const logs = localStorage.getItem('emergency_logs');
        if (!logs) {
            showNotification("No logs available.", "info");
            return;
        }
        
        const parsedLogs = JSON.parse(logs);
        if (parsedLogs.length === 0) {
            showNotification("No logs available.", "info");
            return;
        }
        
        const logWindow = window.open('', '_blank', 'width=900,height=700');
        if (logWindow) {
            logWindow.document.write(`
                <html>
                    <head>
                        <title>Emergency Lock Logs</title>
                        <style>
                            body { background: #0a0a0a; color: #e0e0e0; font-family: 'Courier New', monospace; padding: 20px; }
                            h1 { color: #ff1744; border-bottom: 2px solid #ff1744; padding-bottom: 10px; }
                            .stats { background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                            .stats span { margin-right: 20px; }
                            .log-entry { border-bottom: 1px solid #333; padding: 12px 0; margin-bottom: 8px; }
                            .log-entry.locked { border-left: 4px solid #ff1744; padding-left: 12px; }
                            .log-entry.unlocked { border-left: 4px solid #4caf50; padding-left: 12px; }
                            .timestamp { color: #888; font-size: 0.85em; }
                            .admin { color: #ffb020; }
                            .duration { color: #4fc3f7; }
                            .badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; }
                            .badge.locked { background: #ff1744; color: white; }
                            .badge.unlocked { background: #4caf50; color: white; }
                            .close-btn { padding: 10px 20px; background: #ff1744; color: white; border: none; border-radius: 5px; cursor: pointer; margin-bottom: 20px; }
                            .close-btn:hover { background: #d50000; }
                        </style>
                    </head>
                    <body>
                        <h1>🔐 Emergency Lock Logs</h1>
                        <div class="stats">
                            <span>📊 Total Events: ${parsedLogs.length}</span>
                            <span>🔒 Locked: ${parsedLogs.filter(l => l.event === 'LOCKED').length}</span>
                            <span>🔓 Unlocked: ${parsedLogs.filter(l => l.event === 'UNLOCKED').length}</span>
                        </div>
                        <button class="close-btn" onclick="window.close()">✕ Close</button>
                        ${parsedLogs.reverse().map(log => `
                            <div class="log-entry ${log.event.toLowerCase()}">
                                <div><span class="badge ${log.event.toLowerCase()}">${log.event}</span> <span class="timestamp">📅 ${log.date || log.timestamp}</span></div>
                                <div>👤 Admin: <span class="admin">${log.adminId}</span></div>
                                ${log.duration_seconds > 0 ? `<div>⏱️ Duration: <span class="duration">${Math.floor(log.duration_seconds / 60)}m ${log.duration_seconds % 60}s</span></div>` : ''}
                                <div style="font-size: 0.8em; color: #666; margin-top: 4px;">🔧 Engine: ${log.system_state.engine_status} | ⚠️ Hazards: ${log.system_state.active_hazards}</div>
                            </div>
                        `).join('')}
                    </body>
                </html>
            `);
            logWindow.document.close();
        }
    } catch (e) {
        console.error("Error viewing logs:", e);
        showNotification("❌ Error viewing logs.", "danger");
    }
};

// View Media Logs
window.viewMediaLogs = function() {
    console.log("📸 Viewing media logs...");
    try {
        const logs = localStorage.getItem('emergency_media_logs');
        if (!logs) {
            showNotification("No media logs available.", "info");
            return;
        }
        
        const parsedLogs = JSON.parse(logs);
        if (parsedLogs.length === 0) {
            showNotification("No media logs available.", "info");
            return;
        }
        
        const logWindow = window.open('', '_blank', 'width=1000,height=800');
        if (logWindow) {
            logWindow.document.write(`
                <html>
                    <head>
                        <title>Emergency Media Logs</title>
                        <style>
                            body { background: #0a0a0a; color: #e0e0e0; font-family: 'Inter', sans-serif; padding: 20px; }
                            h1 { color: #b4ff3a; border-bottom: 2px solid #b4ff3a; padding-bottom: 10px; }
                            .stats { background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                            .stats span { margin-right: 20px; }
                            .media-entry { border: 1px solid #333; border-radius: 10px; padding: 15px; margin-bottom: 15px; background: #111; }
                            .media-entry .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
                            .media-entry .preview { margin-top: 10px; max-width: 100%; border-radius: 8px; overflow: hidden; }
                            .media-entry .preview img, .media-entry .preview video { max-width: 100%; max-height: 400px; border-radius: 8px; }
                            .badge { display: inline-block; padding: 2px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; }
                            .badge.image { background: #2196f3; color: white; }
                            .badge.video { background: #ffb020; color: black; }
                            .badge.none { background: #666; color: white; }
                            .timestamp { color: #888; font-size: 0.85em; }
                            .close-btn { padding: 10px 20px; background: #b4ff3a; color: #0a0a0a; border: none; border-radius: 8px; cursor: pointer; margin-bottom: 20px; font-weight: 700; }
                            .close-btn:hover { background: #9ee03a; }
                            .media-info { color: #aaa; font-size: 0.85em; margin-top: 5px; }
                            .no-media { color: #666; font-style: italic; }
                        </style>
                    </head>
                    <body>
                        <h1>📸 Emergency Media Logs</h1>
                        <div class="stats">
                            <span>📊 Total Entries: ${parsedLogs.length}</span>
                            <span>🖼️ Images: ${parsedLogs.filter(l => l.media_type === 'image').length}</span>
                            <span>🎥 Videos: ${parsedLogs.filter(l => l.media_type === 'video').length}</span>
                        </div>
                        <button class="close-btn" onclick="window.close()">✕ Close</button>
                        ${parsedLogs.reverse().map(log => `
                            <div class="media-entry">
                                <div class="header">
                                    <div>
                                        <span class="badge ${log.media_type}">${log.media_type.toUpperCase()}</span>
                                        <span class="timestamp">📅 ${log.date || log.timestamp}</span>
                                        <span style="color: #888; font-size: 0.8em; margin-left: 10px;">Source: ${log.source}</span>
                                    </div>
                                    ${log.duration ? `<span style="color: #4fc3f7;">⏱️ ${log.duration.toFixed(1)}s</span>` : ''}
                                </div>
                                ${log.data && log.data.startsWith('data:') ? `
                                    <div class="preview">
                                        ${log.media_type === 'video' ? `
                                            <video controls style="max-width: 100%; max-height: 400px; border-radius: 8px;">
                                                <source src="${log.data}" type="video/webm">
                                                Your browser does not support the video tag.
                                            </video>
                                        ` : `
                                            <img src="${log.data}" alt="Snapshot" style="max-width: 100%; max-height: 400px; border-radius: 8px;">
                                        `}
                                    </div>
                                ` : `
                                    <div class="no-media">${log.data || 'No media available'}</div>
                                `}
                                <div class="media-info">
                                    ${log.media_type === 'none' ? '⚠️ No media source available at time of emergency' : ''}
                                </div>
                            </div>
                        `).join('')}
                    </body>
                </html>
            `);
            logWindow.document.close();
        }
    } catch (e) {
        console.error("Error viewing media logs:", e);
        showNotification("❌ Error viewing media logs.", "danger");
    }
};

// Download logs as JSON file
window.downloadEmergencyLogs = function() {
    console.log("📥 Downloading logs...");
    try {
        const logs = localStorage.getItem('emergency_logs');
        if (!logs) {
            showNotification("No logs available to download.", "info");
            return;
        }
        
        const blob = new Blob([logs], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `emergency_logs_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification("📥 Logs downloaded successfully!", "success");
    } catch (e) {
        console.error("Error downloading logs:", e);
        showNotification("❌ Error downloading logs.", "danger");
    }
};

// ============================================
// NOTIFICATION AND UTILITY FUNCTIONS
// ============================================

function showNotification(message, type = "info") {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        border-radius: 12px;
        background: ${type === 'danger' ? '#ff1744' : type === 'success' ? '#4caf50' : '#2196f3'};
        color: white;
        font-weight: 600;
        z-index: 9999;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        animation: slideIn 0.3s ease;
        max-width: 400px;
        font-family: 'Inter', sans-serif;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Add animations
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.8; } }
`;
document.head.appendChild(notificationStyles);

// ============================================
// KEYBOARD SHORTCUTS AND INITIALIZATION
// ============================================

// Keyboard shortcut for emergency (Ctrl+Shift+E)
document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        if (isLocked) {
            window.openEmergencyModal();
        } else {
            window.triggerEmergencyLock();
        }
    }
});

// DOM Ready - Initialize everything
document.addEventListener("DOMContentLoaded", () => {
    console.log("🔐 Emergency system initializing...");
    checkLockState();

    // Emergency button
    const emergencyBtn = document.getElementById("trigger-emergency-btn");
    if (emergencyBtn) {
        emergencyBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            if (isLocked) {
                window.openEmergencyModal();
            } else {
                showNotification("📸 Capturing media...", "info");
                await captureAndLogMedia();
                window.triggerEmergencyLock();
            }
        });
    }

    // Lockout overlay unlock button
    const unlockBtn = document.getElementById("lockout-unlock-btn");
    if (unlockBtn) {
        unlockBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("🔓 Unlock button clicked - opening modal");
            window.openEmergencyModal();
        });
        unlockBtn.addEventListener("mouseenter", () => {
            unlockBtn.style.transform = "scale(1.05)";
            unlockBtn.style.boxShadow = "0 0 50px rgba(180, 255, 58, 0.4)";
        });
        unlockBtn.addEventListener("mouseleave", () => {
            unlockBtn.style.transform = "scale(1)";
            unlockBtn.style.boxShadow = "0 0 30px rgba(180, 255, 58, 0.2)";
        });
    }

    // View Logs button
    const viewLogsBtn = document.getElementById("view-logs-btn");
    if (viewLogsBtn) {
        viewLogsBtn.addEventListener("click", (e) => {
            e.preventDefault();
            console.log("📋 View Logs button clicked");
            window.viewEmergencyLogs();
        });
    }

    // View Media Logs button
    const viewMediaLogsBtn = document.getElementById("view-media-logs-btn");
    if (viewMediaLogsBtn) {
        viewMediaLogsBtn.addEventListener("click", (e) => {
            e.preventDefault();
            console.log("📸 View Media Logs button clicked");
            window.viewMediaLogs();
        });
    }

    // Download Logs button
    const downloadLogsBtn = document.getElementById("download-logs-btn");
    if (downloadLogsBtn) {
        downloadLogsBtn.addEventListener("click", (e) => {
            e.preventDefault();
            console.log("📥 Download Logs button clicked");
            window.downloadEmergencyLogs();
        });
    }

    console.log("🔐 Emergency system initialized. Press Ctrl+Shift+E for instant lock/unlock.");
    console.log("🔑 Credentials: ID='SAFEGUARD_ADMIN', Password='SAFEGUARD@2024'");
    console.log("📸 Media capture enabled - Emergency button will capture snapshots/videos");
    console.log("📝 Logs will be saved to Emergency_log.json on server");
});

console.log("🔐 Emergency system loaded.");
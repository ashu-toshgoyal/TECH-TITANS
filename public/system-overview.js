// ============================================================
// SYSTEM OVERVIEW - SAFEGUARD AI
// GSAP animations and interactivity
// ============================================================

document.addEventListener("DOMContentLoaded", function() {
    // Register GSAP plugins
    gsap.registerPlugin(ScrollTrigger);

    // ============================================
    // 1. ANIMATE ELEMENTS ON SCROLL
    // ============================================
    
    // Animate architecture nodes
    gsap.utils.toArray('.arch-node').forEach((node, i) => {
        gsap.from(node, {
            opacity: 0,
            y: 30,
            duration: 0.8,
            delay: i * 0.15,
            scrollTrigger: {
                trigger: node,
                start: 'top 90%',
                toggleActions: 'play none none reverse'
            }
        });
    });

    // Animate spec items
    gsap.utils.toArray('.spec-item').forEach((item, i) => {
        gsap.from(item, {
            opacity: 0,
            y: 20,
            duration: 0.6,
            delay: i * 0.08,
            scrollTrigger: {
                trigger: item,
                start: 'top 92%',
                toggleActions: 'play none none reverse'
            }
        });
    });

    // Animate camera items
    gsap.utils.toArray('.camera-item').forEach((item, i) => {
        gsap.from(item, {
            opacity: 0,
            x: -20,
            duration: 0.6,
            delay: i * 0.08,
            scrollTrigger: {
                trigger: item,
                start: 'top 92%',
                toggleActions: 'play none none reverse'
            }
        });
    });

    // Animate memory items
    gsap.utils.toArray('.memory-item').forEach((item, i) => {
        gsap.from(item, {
            opacity: 0,
            y: 20,
            duration: 0.6,
            delay: i * 0.1,
            scrollTrigger: {
                trigger: item,
                start: 'top 92%',
                toggleActions: 'play none none reverse'
            }
        });
    });

    // Animate network items
    gsap.utils.toArray('.network-item').forEach((item, i) => {
        gsap.from(item, {
            opacity: 0,
            scale: 0.9,
            duration: 0.5,
            delay: i * 0.08,
            scrollTrigger: {
                trigger: item,
                start: 'top 92%',
                toggleActions: 'play none none reverse'
            }
        });
    });

    // Animate database items
    gsap.utils.toArray('.db-item').forEach((item, i) => {
        gsap.from(item, {
            opacity: 0,
            y: 20,
            duration: 0.6,
            delay: i * 0.1,
            scrollTrigger: {
                trigger: item,
                start: 'top 92%',
                toggleActions: 'play none none reverse'
            }
        });
    });

    // ============================================
    // 2. USAGE BAR ANIMATION
    // ============================================
    
    gsap.utils.toArray('.usage-fill').forEach((bar) => {
        const targetWidth = bar.style.width;
        bar.style.width = '0%';
        
        gsap.to(bar, {
            width: targetWidth,
            duration: 1.5,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: bar.closest('.spec-item, .memory-item'),
                start: 'top 90%',
                toggleActions: 'play none none reverse'
            }
        });
    });

    // ============================================
    // 3. LIVE CLOCK UPDATER (same as app.js)
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
    // 4. ENGINE TOGGLE (sync with other pages)
    // ============================================
    
    const engineToggle = document.getElementById("engine-toggle");
    const engineStatusLabel = document.getElementById("engine-status-label");
    const engineStatusText = document.getElementById("engine-status-text");

    if (engineToggle) {
        // Check if engine state exists in localStorage
        const savedEngineState = localStorage.getItem('engine_state');
        if (savedEngineState === 'off') {
            engineToggle.checked = false;
            engineStatusLabel.textContent = "OFF";
            engineStatusLabel.style.color = "#ff1744";
            if (engineStatusText) {
                engineStatusText.textContent = "Paused";
            }
        }

        engineToggle.addEventListener("change", function() {
            if (this.checked) {
                engineStatusLabel.textContent = "ON";
                engineStatusLabel.style.color = "#4caf50";
                if (engineStatusText) {
                    engineStatusText.textContent = "Active & Monitoring";
                }
                localStorage.setItem('engine_state', 'on');
                document.querySelector('.overview-badge').innerHTML = '<span class="dot"></span>AI ACTIVE';
            } else {
                engineStatusLabel.textContent = "OFF";
                engineStatusLabel.style.color = "#ff1744";
                if (engineStatusText) {
                    engineStatusText.textContent = "Paused";
                }
                localStorage.setItem('engine_state', 'off');
                document.querySelector('.overview-badge').innerHTML = '<span class="dot" style="background: #ff1744;"></span>AI PAUSED';
            }
        });
    }

    // ============================================
    // 5. EMERGENCY BUTTON
    // ============================================
    
    const emergencyBtn = document.getElementById("trigger-emergency-btn");
    if (emergencyBtn) {
        emergencyBtn.addEventListener("click", function(e) {
            e.preventDefault();
            if (typeof window.triggerEmergencyLock === 'function') {
                window.triggerEmergencyLock();
            } else {
                alert("Emergency system not initialized. Please refresh the page.");
            }
        });
    }

    // ============================================
    // 6. PARALLAX AMBIENT BACKGROUND
    // ============================================
    
    document.addEventListener('mousemove', function(e) {
        const x = (e.clientX / window.innerWidth - 0.5) * 20;
        const y = (e.clientY / window.innerHeight - 0.5) * 20;
        
        const ambient = document.querySelector('.ambient');
        if (ambient) {
            ambient.style.transform = `translate(${x * 0.5}px, ${y * 0.5}px)`;
        }
    });

    // ============================================
    // 7. SMOOTH SCROLL BEHAVIOR
    // ============================================
    
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    console.log("📊 System Overview initialized with GSAP animations");
});
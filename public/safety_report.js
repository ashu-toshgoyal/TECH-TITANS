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
    // 2. GENERATE REPORT
    // ============================================
    const generateReportBtn = document.getElementById("generate-report-btn");
    const reportPeriod = document.getElementById("report-period");
    
    if (generateReportBtn) {
        generateReportBtn.addEventListener("click", generateReport);
    }
    
    // Generate initial report on load
    generateReport();

    async function generateReport() {
        const period = reportPeriod ? reportPeriod.value : "today";
        
        // Show loading state
        generateReportBtn.innerHTML = '<svg class="icon icon-sm"><use href="#i-refresh"/></svg> Generating...';
        generateReportBtn.disabled = true;
        
        try {
            // Fetch report data from API
            const response = await fetch(`http://localhost:8000/api/report?period=${period}`);
            
            if (!response.ok) {
                throw new Error("Failed to fetch report data");
            }
            
            const data = await response.json();
            
            // Update UI with report data
            updateReportUI(data);
            
        } catch (error) {
            console.error("Report generation error:", error);
            
            // If API is not available, use mock data for demonstration
            const mockData = generateMockData(period);
            updateReportUI(mockData);
        } finally {
            // Reset button state
            generateReportBtn.innerHTML = '<svg class="icon icon-sm"><use href="#i-refresh"/></svg> Generate Report';
            generateReportBtn.disabled = false;
        }
    }

    // ============================================
    // 3. UPDATE REPORT UI
    // ============================================
    function updateReportUI(data) {
        // Update statistics
        const totalIncidents = data.total_incidents || 0;
        const highRisk = data.high_risk || 0;
        const mediumRisk = data.medium_risk || 0;
        const lowRisk = data.low_risk || 0;
        const compliant = data.compliant || 0;
        
        document.getElementById("total-incidents").textContent = totalIncidents;
        document.getElementById("high-risk-count").textContent = highRisk;
        document.getElementById("medium-risk-count").textContent = mediumRisk;
        document.getElementById("compliant-count").textContent = compliant;
        
        // Update report count badge
        document.getElementById("report-count-badge").textContent = `${totalIncidents} Records`;
        
        // Update charts
        updateHazardDistributionChart(data.hazards || []);
        updateRiskLevelChart(highRisk, mediumRisk, lowRisk, compliant);
        
        // Update report table
        updateReportTable(data.hazards || []);
        
        // Update PPE compliance
        updatePPECompliance(data.ppe_compliance || {});
    }

    // ============================================
    // 4. UPDATE CHARTS
    // ============================================
    let hazardChart = null;
    let riskChart = null;
    
    function updateHazardDistributionChart(hazards) {
        const ctx = document.getElementById("hazard-distribution-chart");
        if (!ctx) return;
        
        // Count hazard types
        const hazardTypes = {};
        hazards.forEach(hazard => {
            const type = hazard.hazard_name || "Unknown";
            hazardTypes[type] = (hazardTypes[type] || 0) + 1;
        });
        
        const labels = Object.keys(hazardTypes);
        const data = Object.values(hazardTypes);
        
        if (hazardChart) {
            hazardChart.destroy();
        }
        
        hazardChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Hazard Count',
                    data: data,
                    backgroundColor: [
                        'rgba(255, 23, 68, 0.8)',
                        'rgba(255, 176, 32, 0.8)',
                        'rgba(76, 175, 80, 0.8)',
                        'rgba(33, 150, 243, 0.8)',
                        'rgba(180, 255, 58, 0.8)',
                        'rgba(255, 61, 129, 0.8)'
                    ],
                    borderColor: [
                        '#ff1744',
                        '#ffb020',
                        '#4caf50',
                        '#2196f3',
                        '#b4ff3a',
                        '#ff3d81'
                    ],
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#9aa6b8'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#9aa6b8'
                        }
                    }
                }
            }
        });
    }
    
    function updateRiskLevelChart(high, medium, low, compliant) {
        const ctx = document.getElementById("risk-level-chart");
        if (!ctx) return;
        
        if (riskChart) {
            riskChart.destroy();
        }
        
        riskChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['High Risk', 'Medium Risk', 'Low Risk', 'Compliant'],
                datasets: [{
                    data: [high, medium, low, compliant],
                    backgroundColor: [
                        '#ff1744',
                        '#ffb020',
                        '#4caf50',
                        '#2196f3'
                    ],
                    borderColor: '#06070c',
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#9aa6b8',
                            padding: 15,
                            usePointStyle: true,
                            font: {
                                size: 12
                            }
                        }
                    }
                }
            }
        });
    }

    // ============================================
    // 5. UPDATE REPORT TABLE
    // ============================================
    function updateReportTable(hazards) {
        const tableBody = document.getElementById("report-table-body");
        if (!tableBody) return;
        
        if (hazards.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="no-data-row">No hazards detected in this period. ✅</td>
                </tr>`;
            return;
        }
        
        tableBody.innerHTML = "";
        
        hazards.forEach((hazard, index) => {
            const riskLevel = hazard.risk_level || "medium";
            const riskColor = getRiskColor(riskLevel);
            const date = hazard.timestamp ? new Date(hazard.timestamp).toLocaleString() : new Date().toLocaleString();
            
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${hazard.hazard_name || "Unknown"}</td>
                <td>${hazard.location || "N/A"}</td>
                <td><span class="risk-badge" style="background: ${riskColor.bg}; color: ${riskColor.text}; border: 1px solid ${riskColor.border};">${riskColor.label}</span></td>
                <td>${((hazard.confidence || 0) * 100).toFixed(1)}%</td>
                <td>${date}</td>
                <td>${hazard.status || "Open"}</td>
            `;
            
            tableBody.appendChild(row);
        });
    }
    
    function getRiskColor(riskLevel) {
        const risk = String(riskLevel).toLowerCase();
        
        if (risk === 'high' || risk === 'critical') {
            return { bg: 'rgba(255, 23, 68, 0.15)', text: '#ffb4b4', border: 'rgba(255, 23, 68, 0.4)', label: '🔴 HIGH' };
        } else if (risk === 'medium') {
            return { bg: 'rgba(255, 176, 32, 0.15)', text: '#ffe0a0', border: 'rgba(255, 176, 32, 0.4)', label: '🟡 MEDIUM' };
        } else if (risk === 'low') {
            return { bg: 'rgba(76, 175, 80, 0.15)', text: '#a5d6a7', border: 'rgba(76, 175, 80, 0.4)', label: '🟢 LOW' };
        } else {
            return { bg: 'rgba(33, 150, 243, 0.15)', text: '#90caf9', border: 'rgba(33, 150, 243, 0.4)', label: '🔵 SAFE' };
        }
    }

    // ============================================
    // 6. UPDATE PPE COMPLIANCE
    // ============================================
    function updatePPECompliance(ppeData) {
        // PPE compliance items
        const ppeItems = {
            helmet: ppeData.helmet || 85,
            vest: ppeData.vest || 92,
            gloves: ppeData.gloves || 78,
            overall: ppeData.overall || 80
        };
        
        // Update each PPE item
        Object.keys(ppeItems).forEach(type => {
            const item = document.querySelector(`.ppe-item[data-type="${type}"]`);
            if (item) {
                const fill = item.querySelector('.ppe-fill');
                const percentage = item.querySelector('.ppe-percentage');
                
                if (fill) {
                    fill.style.width = `${ppeItems[type]}%`;
                }
                if (percentage) {
                    percentage.textContent = `${ppeItems[type]}%`;
                }
            }
        });
    }

    // ============================================
    // 7. MOCK DATA GENERATOR (for demo)
    // ============================================
    function generateMockData(period) {
        const hazardTypes = [
            "No Hard Hat",
            "No Safety Vest",
            "No Gloves",
            "Unauthorized Entry",
            "Falling Object Risk",
            "Machinery Hazard",
            "Electrical Hazard",
            "Slip/Trip Risk"
        ];
        
        const riskLevels = ["high", "medium", "low", "compliant"];
        
        const mockHazards = [];
        const count = period === "today" ? 10 : period === "week" ? 50 : period === "month" ? 200 : 500;
        
        for (let i = 0; i < count; i++) {
            mockHazards.push({
                hazard_name: hazardTypes[Math.floor(Math.random() * hazardTypes.length)],
                risk_level: riskLevels[Math.floor(Math.random() * 4)],
                confidence: Math.random() * 0.5 + 0.5,
                location: `Zone ${Math.floor(Math.random() * 10) + 1}`,
                timestamp: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
                status: Math.random() > 0.5 ? "Resolved" : "Open"
            });
        }
        
        const high = mockHazards.filter(h => h.risk_level === "high").length;
        const medium = mockHazards.filter(h => h.risk_level === "medium").length;
        const low = mockHazards.filter(h => h.risk_level === "low").length;
        const compliant = mockHazards.filter(h => h.risk_level === "compliant").length;
        
        return {
            total_incidents: mockHazards.length,
            high_risk: high,
            medium_risk: medium,
            low_risk: low,
            compliant: compliant,
            hazards: mockHazards,
            ppe_compliance: {
                helmet: 85,
                vest: 92,
                gloves: 78,
                overall: 80
            }
        };
    }
});
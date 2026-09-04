const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

// ============================================
// SERVE STATIC FILES
// ============================================

// Serve files from the 'public' folder
app.use(express.static(path.join(__dirname, '../public')));

// Serve box_framed directory
app.use('/box_framed', express.static(path.join(__dirname, '../public/box_framed')));

// ============================================
// EMERGENCY LOG - Path and initialization
// ============================================

const EMERGENCY_LOG_PATH = path.join(__dirname, '../Emergency_log.json');

function initEmergencyLog() {
    if (!fs.existsSync(EMERGENCY_LOG_PATH)) {
        const initialLog = {
            logs: [],
            total_events: 0,
            last_updated: new Date().toISOString()
        };
        fs.writeFileSync(EMERGENCY_LOG_PATH, JSON.stringify(initialLog, null, 2));
        console.log('📝 Emergency log file created:', EMERGENCY_LOG_PATH);
    }
}

function readEmergencyLog() {
    try {
        const data = fs.readFileSync(EMERGENCY_LOG_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading emergency log:', error);
        return { logs: [], total_events: 0, last_updated: new Date().toISOString() };
    }
}

function writeEmergencyLog(logData) {
    try {
        fs.writeFileSync(EMERGENCY_LOG_PATH, JSON.stringify(logData, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing emergency log:', error);
        return false;
    }
}

// Initialize log file on startup
initEmergencyLog();

// ============================================
// EMERGENCY LOG API ENDPOINTS
// ============================================

// Save emergency event
app.post('/api/emergency/log', express.json({ limit: '50mb' }), (req, res) => {
    try {
        const { event_type, admin_id, media_data, media_type, source, duration_seconds, engine_status, active_hazards } = req.body;
        
        const logData = readEmergencyLog();
        
        const logEntry = {
            id: `EMG_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            event_type: event_type || 'LOCKED',
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleString(),
            admin_id: admin_id || 'SYSTEM',
            duration_seconds: duration_seconds || 0,
            media: {
                type: media_type || 'none',
                source: source || 'unknown',
                data: media_data || null
            },
            system_state: {
                engine_status: engine_status || 'ON',
                active_hazards: active_hazards || 0
            }
        };
        
        logData.logs.push(logEntry);
        logData.total_events = logData.logs.length;
        logData.last_updated = new Date().toISOString();
        
        if (logData.logs.length > 100) {
            logData.logs = logData.logs.slice(-100);
        }
        
        if (writeEmergencyLog(logData)) {
            console.log(`📝 Emergency log saved: ${event_type} event`);
            res.json({ 
                status: 'success', 
                message: 'Log saved successfully',
                entry: logEntry,
                total: logData.total_events
            });
        } else {
            res.status(500).json({ status: 'error', message: 'Failed to save log' });
        }
    } catch (error) {
        console.error('Error saving emergency log:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Get all emergency logs
app.get('/api/emergency/logs', (req, res) => {
    try {
        const logData = readEmergencyLog();
        res.json({ 
            status: 'success', 
            logs: logData.logs,
            total: logData.total_events,
            last_updated: logData.last_updated
        });
    } catch (error) {
        console.error('Error reading logs:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Get emergency log by ID
app.get('/api/emergency/log/:id', (req, res) => {
    try {
        const logData = readEmergencyLog();
        const entry = logData.logs.find(log => log.id === req.params.id);
        if (entry) {
            res.json({ status: 'success', entry });
        } else {
            res.status(404).json({ status: 'error', message: 'Log entry not found' });
        }
    } catch (error) {
        console.error('Error reading log:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Clear all logs
app.delete('/api/emergency/logs', (req, res) => {
    try {
        const logData = { logs: [], total_events: 0, last_updated: new Date().toISOString() };
        if (writeEmergencyLog(logData)) {
            res.json({ status: 'success', message: 'All logs cleared' });
        } else {
            res.status(500).json({ status: 'error', message: 'Failed to clear logs' });
        }
    } catch (error) {
        console.error('Error clearing logs:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// ============================================
// IMAGE PROCESSING API
// ============================================

app.post('/api/process_frame', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const inputPath = req.file.path;
    const outputDir = path.join(__dirname, '../public/box_framed');
    
    const venvPythonPath = path.join(__dirname, '../.venv/bin/python');
    const pythonExecutable = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';

    const pythonProcess = spawn(pythonExecutable, ['python_service/main.py', inputPath, outputDir]);

    let resultData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', (data) => {
        resultData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString();
    });

    pythonProcess.on('close', (code) => {
        fs.unlink(inputPath, () => {});

        if (code !== 0) {
            console.error('Pipeline Execution Error:', errorData);
            return res.status(500).json({ error: 'Pipeline processing failed', details: errorData });
        }

        try {
            const parsed = JSON.parse(resultData);
            return res.json(parsed);
        } catch (e) {
            console.error('Failed to parse script output:', resultData);
            return res.status(500).json({ error: 'Invalid script response format' });
        }
    });
});

// ============================================
// SERVE HTML FILES - ALL ROUTES
// ============================================

// Root path - serve index.html
app.get('/', (req, res) => {
    const filePath = path.join(__dirname, '../public/index.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.send('SAFEGUARD AI Server Running');
    }
});

// Serve index.html
app.get('/index.html', (req, res) => {
    const filePath = path.join(__dirname, '../public/index.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('index.html not found');
    }
});

// Serve /safety-report (without .html)
app.get('/safety-report', (req, res) => {
    const filePath = path.join(__dirname, '../public/safety_report.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('safety_report.html not found');
    }
});

// Serve safety_report.html
app.get('/safety_report.html', (req, res) => {
    const filePath = path.join(__dirname, '../public/safety_report.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('safety_report.html not found');
    }
});

// Serve /system-overview (without .html)
app.get('/system-overview', (req, res) => {
    const filePath = path.join(__dirname, '../public/system_overview.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('system_overview.html not found');
    }
});

// Serve system_overview.html
app.get('/system_overview.html', (req, res) => {
    const filePath = path.join(__dirname, '../public/system_overview.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('system_overview.html not found');
    }
});

// Serve /incident (without .html)
app.get('/incident', (req, res) => {
    const filePath = path.join(__dirname, '../public/incident.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('incident.html not found');
    }
});

// Serve incident.html
app.get('/incident.html', (req, res) => {
    const filePath = path.join(__dirname, '../public/incident.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('incident.html not found');
    }
});

// Serve /cctv (without .html)
app.get('/cctv', (req, res) => {
    const filePath = path.join(__dirname, '../public/cctv.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('cctv.html not found');
    }
});

// Serve cctv.html
app.get('/cctv.html', (req, res) => {
    const filePath = path.join(__dirname, '../public/cctv.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('cctv.html not found');
    }
});

// ============================================
// DEBUG ROUTE - Check file locations
// ============================================
app.get('/debug', (req, res) => {
    const publicDir = path.join(__dirname, '../public');
    const files = fs.readdirSync(publicDir);
    res.json({
        public_dir: publicDir,
        files: files
    });
});

// ============================================
// FALLBACK - Serve any HTML file from public folder
// ============================================
app.get('/:page.html', (req, res) => {
    const pageName = req.params.page;
    const filePath = path.join(__dirname, '../public', `${pageName}.html`);
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send(`${pageName}.html not found`);
    }
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('==================================================');
    console.log('🚀 SAFEGUARD AI Server running on http://localhost:' + PORT);
    console.log('📹 Live Monitoring: http://localhost:' + PORT + '/');
    console.log('📋 Safety Report: http://localhost:' + PORT + '/safety-report');
    console.log('📊 System Overview: http://localhost:' + PORT + '/system-overview');
    console.log('📈 Incidents: http://localhost:' + PORT + '/incident');
    console.log('🎥 CCTV: http://localhost:' + PORT + '/cctv');
    console.log('🔍 Debug: http://localhost:' + PORT + '/debug');
    console.log('==================================================');
});
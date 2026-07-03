const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const AUTH_DIR = 'auth_info_baileys';

let sock = null;
let currentQr = null;
let connectionStatus = 'disconnected';

// Descarga sesión guardada desde la base de datos de Django
async function syncSessionFromDB() {
    try {
        console.log('Descargando sesión de WhatsApp desde la base de datos...');
        const response = await axios.get(`${BACKEND_URL}/api/operations/whatsapp-session/`);
        const files = response.data;
        
        if (!fs.existsSync(AUTH_DIR)) {
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        }
        
        for (const [filename, content] of Object.entries(files)) {
            const filepath = path.join(AUTH_DIR, filename);
            fs.writeFileSync(filepath, content, 'utf-8');
        }
        console.log(`Sesión descargada. ${Object.keys(files).length} archivos sincronizados.`);
    } catch (err) {
        console.error('Error al descargar sesión de WhatsApp:', err.message);
    }
}

// Inicia el monitor del directorio local para sincronizar escrituras/eliminaciones en Django
function startWatchingSession() {
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    fs.watch(AUTH_DIR, async (eventType, filename) => {
        if (!filename) return;
        const filepath = path.join(AUTH_DIR, filename);
        
        try {
            if (fs.existsSync(filepath)) {
                // Archivo creado o modificado
                const stats = fs.statSync(filepath);
                if (stats.isFile()) {
                    const content = fs.readFileSync(filepath, 'utf-8');
                    await axios.post(`${BACKEND_URL}/api/operations/whatsapp-session/`, {
                        key: filename,
                        data: content
                    });
                }
            } else {
                // Archivo eliminado
                await axios.post(`${BACKEND_URL}/api/operations/whatsapp-session/`, {
                    key: filename,
                    data: ''
                });
            }
        } catch (err) {
            console.error(`Error al sincronizar archivo de sesión (${filename}):`, err.message);
        }
    });
    console.log('Monitoreo y persistencia de sesión activado.');
}

async function connectToWhatsApp() {
    // 1. Descargar credenciales persistentes antes de conectar
    await syncSessionFromDB();

    // 2. Iniciar monitoreo del disco local
    startWatchingSession();

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\nScan this QR code with WhatsApp to link AutoMaster:');
            qrcode.generate(qr, { small: true });
            currentQr = qr;
            connectionStatus = 'qr_ready';
        }
        
        if (connection === 'close') {
            connectionStatus = 'disconnected';
            currentQr = null;
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            connectionStatus = 'connected';
            currentQr = null;
            console.log('AutoMaster WhatsApp service connected successfully!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Start WhatsApp connection
connectToWhatsApp();

// REST API for Django to call

app.get('/api/status', (req, res) => {
    res.json({
        status: connectionStatus,
        qr: currentQr
    });
});

app.post('/api/send-message', async (req, res) => {
    try {
        const { number, text, documentUrl, fileName } = req.body;
        
        if (!number || (!text && !documentUrl)) {
            return res.status(400).json({ error: 'Number and either text or documentUrl are required' });
        }
        
        if (!sock) {
            return res.status(503).json({ error: 'WhatsApp service not ready' });
        }

        // Format number to JID
        const jid = `${number}@s.whatsapp.net`;
        
        if (documentUrl) {
            await sock.sendMessage(jid, { 
                document: { url: documentUrl }, 
                mimetype: 'application/pdf', 
                fileName: fileName || 'Documento.pdf',
                caption: text || ''
            });
        } else {
            await sock.sendMessage(jid, { text: text });
        }
        
        return res.status(200).json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending message:', error);
        return res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`WhatsApp Microservice running on http://localhost:${PORT}`);
});

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
        // Ignorar archivos temporales de pre-keys para evitar saturar el backend con miles de peticiones innecesarias
        if (filename.startsWith('pre-key-')) return;
        
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

// Limpia las credenciales locales y de la base de datos si la conexión fue cerrada por logout o conflicto
async function clearSession() {
    console.log('Limpiando sesión local y remota por cierre de conexión/logout...');
    connectionStatus = 'disconnected';
    currentQr = null;
    
    // 1. Borrar archivos locales de sesión
    if (fs.existsSync(AUTH_DIR)) {
        try {
            const files = fs.readdirSync(AUTH_DIR);
            for (const file of files) {
                const filepath = path.join(AUTH_DIR, file);
                if (fs.statSync(filepath).isFile()) {
                    fs.unlinkSync(filepath);
                }
            }
            console.log('Archivos de sesión local eliminados.');
        } catch (err) {
            console.error('Error al borrar archivos locales de sesión:', err.message);
        }
    }
    
    // 2. Borrar sesión en la base de datos de Django
    try {
        await axios.delete(`${BACKEND_URL}/api/operations/whatsapp-session/`);
        console.log('Sesión remota eliminada de la base de datos.');
    } catch (err) {
        console.error('Error al eliminar sesión remota de la base de datos:', err.message);
    }
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
            const statusCode = lastDisconnect.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            
            if (statusCode === DisconnectReason.loggedOut || (lastDisconnect.error && lastDisconnect.error.message?.includes('conflict'))) {
                // Si la sesión fue cerrada o removida por conflicto, limpiamos credenciales para poder re-escanear QR
                clearSession().then(() => {
                    connectToWhatsApp();
                });
            } else if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            connectionStatus = 'connected';
            currentQr = null;
            console.log('AutoMaster WhatsApp service connected successfully!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Escuchar mensajes entrantes de clientes para automatizar el agente de ventas con IA
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg || !msg.message) return;
            if (msg.key.fromMe) return; // Ignorar mensajes propios
            
            const senderJid = msg.key.remoteJid;
            if (!senderJid || !senderJid.endsWith('@s.whatsapp.net')) return;

            // Extraer texto
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (!text || text.trim() === '') return;

            console.log(`Mensaje entrante de ${senderJid}: "${text}"`);

            // Consultar a Django AI Assistant
            const response = await axios.post(`${BACKEND_URL}/api/ai/whatsapp-agent/`, {
                number: senderJid,
                text: text
            }, { timeout: 15000 });

            if (response.data && response.data.reply) {
                const replyText = response.data.reply;
                console.log(`Respuesta IA para ${senderJid}: "${replyText}"`);
                await sock.sendMessage(senderJid, { text: replyText });
            }
        } catch (err) {
            console.error('Error al responder mensaje vía IA:', err.message);
        }
    });
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

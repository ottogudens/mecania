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

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const AUTH_DIR = 'auth_info_baileys';

let sock = null;
let currentQr = null;
let connectionStatus = 'disconnected';

// Descarga sesión guardada desde la base de datos de Django
async function syncSessionFromDB() {
    try {
        // Si ya existe el archivo de credenciales local creds.json, priorizamos la sesión local y no sobrescribimos
        const credsFile = path.join(AUTH_DIR, 'creds.json');
        if (fs.existsSync(credsFile)) {
            console.log('Sesión local activa encontrada (creds.json). Omitiendo descarga para evitar pérdidas de vinculación.');
            return;
        }

        console.log('Descargando sesión de WhatsApp desde la base de datos...');
        const response = await axios.get(`${BACKEND_URL}/api/operations/whatsapp-session/`);
        const files = response.data;
        
        if (!fs.existsSync(AUTH_DIR)) {
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        }
        
        let count = 0;
        for (const [filename, content] of Object.entries(files)) {
            const isReallyEssential = filename === 'creds.json' || filename.startsWith('app-state-sync-key-');
            if (!isReallyEssential) continue;
            
            const filepath = path.join(AUTH_DIR, filename);
            fs.writeFileSync(filepath, content, 'utf-8');
            count++;
        }
        console.log(`Sesión descargada de la base de datos. ${count} archivos esenciales sincronizados.`);
    } catch (err) {
        console.error('Error al descargar sesión de WhatsApp:', err.message);
    }
}

let pendingSync = {};
let syncTimeout = null;

async function flushSync() {
    if (Object.keys(pendingSync).length === 0) return;
    
    const batch = { ...pendingSync };
    pendingSync = {};
    syncTimeout = null;
    
    try {
        console.log(`Sincronizando lote de ${Object.keys(batch).length} archivos con el backend...`);
        await axios.post(`${BACKEND_URL}/api/operations/whatsapp-session/`, {
            batch: batch
        });
    } catch (err) {
        console.error('Error al sincronizar lote de sesión de WhatsApp:', err.message);
        // Volver a encolar para reintento en el siguiente ciclo
        pendingSync = { ...batch, ...pendingSync };
        scheduleSync();
    }
}

function scheduleSync() {
    if (!syncTimeout) {
        syncTimeout = setTimeout(flushSync, 2000);
    }
}

// Inicia el monitor del directorio local para sincronizar escrituras/eliminaciones en Django
function startWatchingSession() {
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    fs.watch(AUTH_DIR, async (eventType, filename) => {
        if (!filename) return;
        
        const isEssential = filename === 'creds.json' || filename.startsWith('app-state-sync-key-');
        if (!isEssential) return;
        
        const filepath = path.join(AUTH_DIR, filename);
        
        try {
            if (fs.existsSync(filepath)) {
                // Archivo creado o modificado
                const stats = fs.statSync(filepath);
                if (stats.isFile()) {
                    const content = fs.readFileSync(filepath, 'utf-8');
                    pendingSync[filename] = content;
                    scheduleSync();
                }
            } else {
                // Archivo eliminado
                pendingSync[filename] = ''; // Indicar eliminación
                scheduleSync();
            }
        } catch (err) {
            console.error(`Error al preparar sincronización del archivo (${filename}):`, err.message);
        }
    });
    console.log('Monitoreo y persistencia de sesión en lote (batch) activado.');
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
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting: ', shouldReconnect);
            
            // Solo limpiar las credenciales locales y de DB de forma automática si es un logout explícito (desconexión manual)
            if (statusCode === DisconnectReason.loggedOut) {
                console.log('Logout manual detectado. Limpiando credenciales...');
                clearSession().then(() => {
                    connectToWhatsApp();
                });
            } else if (shouldReconnect) {
                // Para cualquier otro error (timeout, conflicto transitorio por reinicio rápido), reintentamos conectar conservando la sesión
                console.log('Desconexión temporal. Intentando reconectar en 3 segundos...');
                setTimeout(() => {
                    connectToWhatsApp();
                }, 3000);
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

app.post('/api/logout', async (req, res) => {
    try {
        console.log('Solicitud manual de desconexión recibida...');
        if (sock) {
            try {
                await sock.logout();
            } catch (err) {
                console.error('Error al ejecutar logout en socket, procediendo con limpieza manual:', err.message);
            }
        }
        await clearSession();
        // Generar un nuevo QR y restablecer conexión como disconnected de cero
        connectToWhatsApp();
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error al desconectar manualmente:', error);
        return res.status(500).json({ error: 'Failed to logout', details: error.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`WhatsApp Microservice running on http://localhost:${PORT}`);
});

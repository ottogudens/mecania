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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

let tempBackendUrl = process.env.BACKEND_URL || '';
if (!tempBackendUrl) {
    if (process.env.RAILWAY_SERVICE_BACKEND_URL) {
        tempBackendUrl = `https://${process.env.RAILWAY_SERVICE_BACKEND_URL}`;
    } else {
        tempBackendUrl = 'http://localhost:8080';
    }
}
// Normalize BACKEND_URL: prepend http:// or https:// if protocol is missing
if (tempBackendUrl && !tempBackendUrl.startsWith('http://') && !tempBackendUrl.startsWith('https://')) {
    if (tempBackendUrl.includes('railway.internal')) {
        tempBackendUrl = `http://${tempBackendUrl}`;
    } else {
        tempBackendUrl = `https://${tempBackendUrl}`;
    }
}
const BACKEND_URL = tempBackendUrl.replace(/\/+$/, '');
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'mecania-default-internal-secret-token-key-2026';
const AUTH_DIR = 'auth_info_baileys';

// Middleware for validating internal API Requests from Django
function requireInternalKey(req, res, next) {
    const providedKey = req.headers['x-mecania-secret-key'];
    if (INTERNAL_API_KEY && providedKey !== INTERNAL_API_KEY) {
        return res.status(403).json({ error: 'Unauthorized: invalid or missing API Key' });
    }
    next();
}

let sock = null;
let currentQr = null;
let connectionStatus = 'disconnected';

// Descarga sesión guardada desde la base de datos de Django con reintentos robustos en caso de fallo de red/servidor
async function syncSessionFromDB() {
    const credsFile = path.join(AUTH_DIR, 'creds.json');
    if (fs.existsSync(credsFile)) {
        console.log('Sesión local activa encontrada (creds.json). Omitiendo descarga para evitar pérdidas de vinculación.');
        return;
    }

    while (true) {
        try {
            console.log('Descargando sesión de WhatsApp desde la base de datos...');
            const response = await axios.get(`${BACKEND_URL}/api/operations/whatsapp-session/`, {
                headers: { 'X-Mecania-Secret-Key': INTERNAL_API_KEY },
                timeout: 10000
            });
            const files = response.data;
            
            if (!fs.existsSync(AUTH_DIR)) {
                fs.mkdirSync(AUTH_DIR, { recursive: true });
            }
            
            let count = 0;
            for (const [filename, content] of Object.entries(files)) {
                if (!filename.endsWith('.json')) continue;
                
                const filepath = path.join(AUTH_DIR, filename);
                fs.writeFileSync(filepath, content, 'utf-8');
                count++;
            }
            console.log(`Sesión descargada de la base de datos. ${count} archivos de autenticación sincronizados.`);
            break; // Descarga exitosa, salir del bucle
        } catch (err) {
            console.error('Error al descargar sesión de WhatsApp, reintentando en 5 segundos:', err.message);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

let pendingSync = {};
let syncTimeout = null;
let isSyncing = false;

async function flushSync() {
    if (isSyncing) {
        // Si hay una sincronización en curso, posponerla para cuando termine
        scheduleSync();
        return;
    }
    
    if (Object.keys(pendingSync).length === 0) return;
    
    isSyncing = true;
    const batch = { ...pendingSync };
    pendingSync = {};
    syncTimeout = null;
    
    try {
        console.log(`Sincronizando lote de ${Object.keys(batch).length} archivos con el backend...`);
        await axios.post(`${BACKEND_URL}/api/operations/whatsapp-session/`, {
            batch: batch
        }, {
            headers: { 'X-Mecania-Secret-Key': INTERNAL_API_KEY }
        });
    } catch (err) {
        console.error('Error al sincronizar lote de sesión de WhatsApp:', err.message);
        // Volver a encolar para reintento en el siguiente ciclo
        pendingSync = { ...batch, ...pendingSync };
        scheduleSync();
    } finally {
        isSyncing = false;
    }
}

function scheduleSync() {
    if (!syncTimeout) {
        syncTimeout = setTimeout(flushSync, 2000);
    }
}

// Prepara la sincronización del archivo local especifico en la base de datos
async function syncFileToDB(filename) {
    if (!filename.endsWith('.json')) return;
    const filepath = path.join(AUTH_DIR, filename);
    try {
        if (fs.existsSync(filepath)) {
            const content = fs.readFileSync(filepath, 'utf-8');
            pendingSync[filename] = content;
        } else {
            pendingSync[filename] = ''; // Indicar eliminación
        }
        scheduleSync();
    } catch (err) {
        console.error(`Error preparando sincronización de archivo (${filename}):`, err.message);
    }
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
        await axios.delete(`${BACKEND_URL}/api/operations/whatsapp-session/`, {
            headers: { 'X-Mecania-Secret-Key': INTERNAL_API_KEY }
        });
        console.log('Sesión remota eliminada de la base de datos.');
    } catch (err) {
        console.error('Error al eliminar sesión remota de la base de datos:', err.message);
    }
}

function getMessageText(message) {
    if (!message) return '';
    if (message.ephemeralMessage?.message) {
        message = message.ephemeralMessage.message;
    }
    if (message.viewOnceMessage?.message) {
        message = message.viewOnceMessage.message;
    }
    if (message.viewOnceMessageV2?.message) {
        message = message.viewOnceMessageV2.message;
    }
    if (message.documentWithCaptionMessage?.message) {
        message = message.documentWithCaptionMessage.message;
    }
    return message.conversation || 
           message.extendedTextMessage?.text || 
           message.imageMessage?.caption || 
           message.videoMessage?.caption ||
           message.documentMessage?.caption ||
           message.buttonsResponseMessage?.selectedButtonId ||
           message.listResponseMessage?.singleSelectReply?.selectedRowId ||
           message.templateButtonReplyMessage?.selectedId ||
           '';
}

async function syncMessageToDjango(phone, text, sender, timestamp) {
    try {
        await axios.post(`${BACKEND_URL}/api/operations/whatsapp-messages/sync/`, {
            messages: [{
                phone: phone,
                text: text,
                sender: sender,
                timestamp: timestamp
            }]
        }, {
            headers: { 'X-Mecania-Secret-Key': INTERNAL_API_KEY },
            timeout: 10000
        });
    } catch (err) {
        console.error('Error al sincronizar mensaje individual con backend:', err.message);
    }
}

async function connectToWhatsApp() {
    // 1. Descargar credenciales persistentes antes de conectar
    await syncSessionFromDB();

    // Cerrar conexión anterior si existía para evitar colisiones en memoria
    if (sock) {
        try {
            sock.end();
        } catch (e) {
            console.log('Error cerrando socket anterior:', e.message);
        }
        sock = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    // Instalar ganchos (hooks) explícitos para sincronizar el estado Baileys en caliente
    const originalSaveCreds = saveCreds;
    const wrappedSaveCreds = async () => {
        await originalSaveCreds();
        await syncFileToDB('creds.json');
    };

    const originalSetKeys = state.keys.set;
    state.keys.set = async (data) => {
        await originalSetKeys(data);
        const syncTasks = [];
        for (const category in data) {
            for (const id in data[category]) {
                const filename = `${category}-${id}.json`;
                syncTasks.push(syncFileToDB(filename));
            }
        }
        await Promise.all(syncTasks);
    };

    const currentSock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });
    sock = currentSock;

    currentSock.ev.on('connection.update', (update) => {
        if (currentSock !== sock) return;
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
            const errStr = lastDisconnect.error?.message || lastDisconnect.error?.output?.payload?.message || lastDisconnect.error?.toString() || '';
            console.log(`Connection closed: statusCode=${statusCode}, error="${errStr}"`);
            
            // A session conflict can return 401. Let's make sure it's not a conflict, device removal, or restart.
            const isConflict = errStr.toLowerCase().includes('conflict') || 
                               errStr.toLowerCase().includes('device_removed') || 
                               statusCode === DisconnectReason.connectionReplaced || 
                               statusCode === 440;
            
            const isLoggedOut = statusCode === DisconnectReason.loggedOut && !isConflict;
            const shouldReconnect = !isLoggedOut;
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting: ', shouldReconnect);
            
            // Solo limpiar las credenciales locales y de DB si es un logout explícito/real
            if (isLoggedOut) {
                console.log('Logout manual o desvinculación real detectada. Limpiando credenciales...');
                clearSession().then(() => {
                    connectToWhatsApp();
                });
            } else if (isConflict) {
                // Conflicto de sesión: otra instancia o dispositivo tomó el control del socket.
                // Usar un delay largo (60s) para evitar bucle de reconexión competitiva.
                console.warn('⚠️  Conflicto de sesión detectado. Esperando 60 segundos antes de reintentar...');
                setTimeout(() => {
                    connectToWhatsApp();
                }, 60000);
            } else if (shouldReconnect) {
                // Para cualquier otro error transitorio (timeout, red, restart required), reintentamos rápido conservando la sesión
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

    currentSock.ev.on('creds.update', async () => {
        if (currentSock !== sock) return;
        await wrappedSaveCreds();
    });

    // Escuchar mensajes de WhatsApp (entrantes y salientes) y sincronizarlos con Django
    currentSock.ev.on('messages.upsert', async (m) => {
        if (currentSock !== sock) return;
        try {
            const msg = m.messages[0];
            if (!msg) return;

            const senderJid = msg.key?.remoteJid;
            console.log(`[DEBUG] Mensaje en upsert. JID: ${senderJid}, fromMe: ${msg.key?.fromMe}, hasMessage: ${!!msg.message}`);

            if (!msg.message || !senderJid) return;
            
            const isUser = senderJid.endsWith('@s.whatsapp.net') || senderJid.endsWith('@lid');
            if (!isUser) {
                console.log(`[DEBUG] Ignorando mensaje de JID no compatible: ${senderJid}`);
                return;
            }

            // Extraer texto
            const text = getMessageText(msg.message);
            if (!text || text.trim() === '') {
                console.log(`[DEBUG] Mensaje vacío o tipo no compatible ignorado para JID: ${senderJid}`);
                return;
            }

            const timestamp = msg.messageTimestamp ? Number(msg.messageTimestamp) : Math.floor(Date.now() / 1000);

            if (msg.key.fromMe) {
                // Mensaje saliente enviado desde nuestro propio número (ya sea manual o por el asistente)
                console.log(`Mensaje saliente propio para ${senderJid}: "${text}"`);
                await syncMessageToDjango(senderJid, text, 'assistant', timestamp);
                return;
            }

            console.log(`Mensaje entrante de ${senderJid}: "${text}"`);
            
            // Sincronizar mensaje entrante del cliente al backend
            await syncMessageToDjango(senderJid, text, 'client', timestamp);

            // Consultar a Django AI Assistant para responder de manera automatizada
            const response = await axios.post(`${BACKEND_URL}/api/ai/whatsapp-agent/`, {
                number: senderJid,
                text: text
            }, {
                headers: { 'X-Mecania-Secret-Key': INTERNAL_API_KEY },
                timeout: 15000
            });

            if (response.data && response.data.reply) {
                const replyText = response.data.reply;
                console.log(`Respuesta IA para ${senderJid}: "${replyText}"`);
                await sock.sendMessage(senderJid, { text: replyText });
            }
        } catch (err) {
            console.error('Error al responder mensaje vía IA:', err.message, err.response?.data || err);
        }
    });

    // Sincronizar historial de conversaciones (messaging-history.set) al vincular/conectar
    currentSock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
        if (currentSock !== sock) return;
        try {
            console.log(`Recibido evento messaging-history.set. Procesando ${messages ? messages.length : 0} mensajes del historial...`);
            if (!messages || messages.length === 0) return;

            const formattedMessages = [];

            for (const msg of messages) {
                if (!msg.message || !msg.key) continue;

                const remoteJid = msg.key.remoteJid;
                if (!remoteJid || !remoteJid.endsWith('@s.whatsapp.net')) continue;

                const text = getMessageText(msg.message);
                if (!text || text.trim() === '') continue;

                // De historia, asumimos 'assistant' si es de nosotros, 'client' si no.
                const sender = msg.key.fromMe ? 'assistant' : 'client';
                const timestamp = msg.messageTimestamp ? Number(msg.messageTimestamp) : Math.floor(Date.now() / 1000);

                formattedMessages.push({
                    phone: remoteJid,
                    text: text,
                    sender: sender,
                    timestamp: timestamp
                });
            }

            if (formattedMessages.length > 0) {
                console.log(`Enviando ${formattedMessages.length} mensajes históricos al backend en lotes...`);
                const batchSize = 100;
                for (let i = 0; i < formattedMessages.length; i += batchSize) {
                    const batch = formattedMessages.slice(i, i + batchSize);
                    try {
                        const response = await axios.post(`${BACKEND_URL}/api/operations/whatsapp-messages/sync/`, {
                            messages: batch
                        }, {
                            headers: { 'X-Mecania-Secret-Key': INTERNAL_API_KEY },
                            timeout: 30000
                        });
                        console.log(`Lote de sincronización enviado: +${response.data?.created || 0} creados.`);
                    } catch (batchErr) {
                        console.error('Error al enviar lote de sincronización de mensajes:', batchErr.message, batchErr.response?.data || batchErr);
                    }
                }
            }
        } catch (err) {
            console.error('Error en el listener de messaging-history.set:', err.message, err);
        }
    });
}

// Start WhatsApp connection
connectToWhatsApp();

// REST API for Django to call

app.get('/api/status', requireInternalKey, (req, res) => {
    res.json({
        status: connectionStatus,
        qr: currentQr,
        user: sock ? sock.user : null
    });
});

app.post('/api/resolve-number', requireInternalKey, async (req, res) => {
    try {
        const { number } = req.body;
        if (!number) {
            return res.status(400).json({ error: 'Number is required' });
        }
        if (!sock) {
            return res.status(503).json({ error: 'WhatsApp service not ready' });
        }
        const cleanNumber = String(number).replace(/\D/g, '');
        const result = await sock.onWhatsApp(cleanNumber);
        return res.status(200).json({ number, cleanNumber, result });
    } catch (err) {
        console.error('Error in /api/resolve-number:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/send-message', requireInternalKey, async (req, res) => {
    try {
        const { number, text, documentUrl, documentBase64, fileName } = req.body;
        
        if (!number || (!text && !documentUrl && !documentBase64)) {
            return res.status(400).json({ error: 'Number and either text, documentUrl or documentBase64 are required' });
        }
        
        if (!sock) {
            return res.status(503).json({ error: 'WhatsApp service not ready' });
        }

        // Format number to JID
        const cleanNumber = String(number).replace(/\D/g, '');
        let jid = `${cleanNumber}@s.whatsapp.net`;
        
        try {
            const result = await sock.onWhatsApp(cleanNumber);
            if (result && result.length > 0 && result[0].exists) {
                jid = result[0].jid;
                console.log(`Resolved JID for number ${number} using onWhatsApp -> ${jid}`);
            } else {
                console.warn(`Number ${number} / ${cleanNumber} not found on WhatsApp, using fallback JID: ${jid}`);
            }
        } catch (err) {
            console.error('Error resolving JID using onWhatsApp, reusing fallback:', err.message);
        }
        
        if (documentBase64) {
            await sock.sendMessage(jid, { 
                document: Buffer.from(documentBase64, 'base64'), 
                mimetype: 'application/pdf', 
                fileName: fileName || 'Documento.pdf',
                caption: text || ''
            });
        } else if (documentUrl) {
            await sock.sendMessage(jid, { 
                document: { url: documentUrl }, 
                mimetype: 'application/pdf', 
                fileName: fileName || 'Documento.pdf',
                caption: text || ''
            });
        } else {
            await sock.sendMessage(jid, { text: text });
        }
        
        return res.status(200).json({ success: true, message: 'Message sent successfully', resolvedJid: jid });
    } catch (error) {
        console.error('Error sending message:', error);
        return res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
});

app.post('/api/logout', requireInternalKey, async (req, res) => {
    try {
        console.log('Solicitud manual de desconexión recibida...');
        if (sock) {
            const oldSock = sock;
            sock = null; // Desvincular inmediatamente para evitar ejecuciones duplicadas en listeners
            try {
                await oldSock.logout();
            } catch (err) {
                console.error('Error al ejecutar logout en socket:', err.message);
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

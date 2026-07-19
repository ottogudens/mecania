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
const AUTH_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || 'auth_info_baileys';

// Phone formatting helper
function formatChileanNumber(phone) {
    let cleanNumber = String(phone).replace(/\D/g, '');
    if (cleanNumber.length === 8) {
        cleanNumber = `569${cleanNumber}`;
    } else if (cleanNumber.length === 9 && cleanNumber.startsWith('9')) {
        cleanNumber = `56${cleanNumber}`;
    }
    return cleanNumber;
}

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
let currentPairingCode = null;
let connectionStatus = 'disconnected';

// Map to keep track of phone-to-LID mappings for correct message thread routing
const lidCache = new Map();

// Helper to check if a phone JID or clean string represents a LID JID
function isLidJid(numberStr) {
    const clean = String(numberStr).replace(/\D/g, '');
    return String(numberStr).includes('@lid') || 
           clean.startsWith('2377') || 
           (clean.length >= 14 && !clean.startsWith('56'));
}

// Extract possible phone numbers from different Baileys message properties
function resolvePhoneJidFromMessage(msg) {
    if (!msg) return null;
    const candidates = [
        msg.senderPn,
        msg.key?.senderPn,
        msg.participantPn,
        msg.key?.participantPn,
        msg.key?.remoteJidAlt,
        msg.key?.participant,
        msg.participant
    ];
    for (const cand of candidates) {
        if (typeof cand === 'string' && cand.endsWith('@s.whatsapp.net')) {
            return cand;
        }
    }
    return null;
}

// Query state, Cache, and signalRepository to resolve a LID JID string to a phone JID string
async function resolveJidToPhone(jid) {
    if (!jid) return null;
    if (jid.endsWith('@s.whatsapp.net')) return jid;
    if (!jid.endsWith('@lid')) return null;

    // 1. Check native Baileys signalRepository mapping
    if (sock && sock.signalRepository && sock.signalRepository.lidMapping) {
        try {
            const resolved = await sock.signalRepository.lidMapping.getPNForLID(jid);
            if (resolved && resolved.endsWith('@s.whatsapp.net')) {
                return resolved;
            }
        } catch (e) {
            console.error('[DEBUG] Error getting PN for LID from signalRepository:', e.message);
        }
    }

    // 2. Reverse lookup in cacheMap
    for (const [phone, cachedLid] of lidCache.entries()) {
        if (cachedLid === jid) {
            return `${phone}@s.whatsapp.net`;
        }
    }

    // 3. Search in authState credentials mapping
    if (sock && sock.authState && sock.authState.creds) {
        const creds = sock.authState.creds;
        const resolved = creds.lidToJid?.[jid] || creds.lidJidMap?.[jid];
        if (resolved && resolved.endsWith('@s.whatsapp.net')) {
            return resolved;
        }
    }

    return null;
}

// Convert any incoming command phone parameter to final sending JID
async function getToSendJid(number) {
    if (!number) return null;
    const clean = String(number).replace(/\D/g, '');
    const isLid = isLidJid(number);

    if (isLid) {
        return number.includes('@lid') ? number : `${clean}@lid`;
    }

    const formattedPhone = formatChileanNumber(clean);
    if (lidCache.has(formattedPhone)) {
        return lidCache.get(formattedPhone);
    }

    // Check with onWhatsApp
    try {
        const result = await sock.onWhatsApp(formattedPhone);
        if (result && result.length > 0 && result[0].exists) {
            const resolvedJid = result[0].jid;
            if (resolvedJid.endsWith('@lid')) {
                lidCache.set(formattedPhone, resolvedJid);
            }
            return resolvedJid;
        }
    } catch (err) {
        console.error('[DEBUG] Error resolving JID using onWhatsApp:', err.message);
    }

    return `${formattedPhone}@s.whatsapp.net`;
}


// Descarga sesión guardada desde la base de datos de Django con reintentos robustos en caso de fallo de red/servidor
async function syncSessionFromDB() {
    const credsFile = path.join(AUTH_DIR, 'creds.json');
    if (fs.existsSync(credsFile)) {
        console.log('Sesión local activa encontrada (creds.json). Omitiendo descarga para evitar pérdidas de vinculación.');
        return;
    }

    const MAX_RETRIES = 5;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`Descargando sesión de WhatsApp desde la base de datos (intento ${attempt}/${MAX_RETRIES})...`);
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
            return; // Descarga exitosa
        } catch (err) {
            console.error(`Error al descargar sesión de WhatsApp (intento ${attempt}/${MAX_RETRIES}):`, err.message);
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    console.warn('No se pudo descargar sesión del backend tras múltiples intentos. Iniciando como nueva conexión (se generará QR).');
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
    currentPairingCode = null;
    
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
            currentPairingCode = null;

            // Guard: lastDisconnect puede ser undefined en ciertos errores de red
            if (!lastDisconnect) {
                console.warn('Conexión cerrada sin información de error. Reconectando en 3 segundos...');
                setTimeout(() => {
                    connectToWhatsApp();
                }, 3000);
                return;
            }

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
            currentPairingCode = null;
            console.log('AutoMaster WhatsApp service connected successfully!');
        }
    });

    currentSock.ev.on('creds.update', async () => {
        if (currentSock !== sock) return;
        await wrappedSaveCreds();
    });

    currentSock.ev.on('contacts.upsert', async (contacts) => {
        if (currentSock !== sock) return;
        try {
            console.log(`[DEBUG] Recibido evento contacts.upsert: ${contacts.length} contactos`);
            for (const c of contacts) {
                if (c.id && c.lid) {
                    const phone = c.id.endsWith('@s.whatsapp.net') ? c.id : (c.phoneNumber ? `${c.phoneNumber}@s.whatsapp.net` : null);
                    const lid = c.lid.endsWith('@lid') ? c.lid : `${c.lid}@lid`;
                    if (phone && lid) {
                        const cleanPhone = formatChileanNumber(phone);
                        lidCache.set(cleanPhone, lid);
                    }
                }
                if (c.id && c.id.endsWith('@lid') && c.phoneNumber) {
                    const cleanPhone = formatChileanNumber(c.phoneNumber);
                    lidCache.set(cleanPhone, c.id);
                }
            }
        } catch (e) {
            console.error('Error en contacts.upsert:', e.message);
        }
    });

    currentSock.ev.on('contacts.update', async (updates) => {
        if (currentSock !== sock) return;
        try {
            console.log(`[DEBUG] Recibido evento contacts.update: ${updates.length} actualizaciones`);
            for (const c of updates) {
                if (c.id && c.lid) {
                    const phone = c.id.endsWith('@s.whatsapp.net') ? c.id : (c.phoneNumber ? `${c.phoneNumber}@s.whatsapp.net` : null);
                    const lid = c.lid.endsWith('@lid') ? c.lid : `${c.lid}@lid`;
                    if (phone && lid) {
                        const cleanPhone = formatChileanNumber(phone);
                        lidCache.set(cleanPhone, lid);
                    }
                }
                if (c.id && c.id.endsWith('@lid') && c.phoneNumber) {
                    const cleanPhone = formatChileanNumber(c.phoneNumber);
                    lidCache.set(cleanPhone, c.id);
                }
            }
        } catch (e) {
            console.error('Error en contacts.update:', e.message);
        }
    });

    // Función de procesamiento de mensajes entrantes (no-bloqueante)
    async function processIncomingMessage(senderJid, originalSenderJid, text, timestamp) {
        try {
            // Consultar a Django AI Assistant para responder de manera automatizada
            // El AI agent se encarga de guardar el mensaje entrante, así que no lo sincronizamos aquí
            const response = await axios.post(`${BACKEND_URL}/api/ai/whatsapp-agent/`, {
                number: senderJid,
                text: text
            }, {
                headers: { 'X-Mecania-Secret-Key': INTERNAL_API_KEY },
                timeout: 45000
            });

            if (response.data && response.data.reply) {
                const replyText = response.data.reply;
                console.log(`Respuesta IA para ${senderJid} (JID de envío: ${originalSenderJid}): "${replyText}"`);

                // Retry con limpieza de sesión si el primer intento falla
                let sent = false;
                for (let attempt = 1; attempt <= 2; attempt++) {
                    try {
                        await sock.sendMessage(originalSenderJid, { text: replyText });
                        sent = true;
                        break;
                    } catch (sendErr) {
                        console.error(`Error al enviar (intento ${attempt}/2):`, sendErr.message);
                        if (attempt === 1) {
                            // Limpiar sesión Signal corrupt para este contacto y reintentar
                            try {
                                const cleanJid = originalSenderJid.split('@')[0];
                                const authDir = AUTH_DIR;
                                const fs2 = require('fs');
                                const files = fs2.readdirSync(authDir);
                                let cleared = 0;
                                for (const f of files) {
                                    if (f.startsWith('session-') && f.includes(cleanJid)) {
                                        fs2.unlinkSync(`${authDir}/${f}`);
                                        cleared++;
                                        console.log(`Sesión limpiada: ${f}`);
                                    }
                                }
                                if (cleared > 0) {
                                    console.log(`Limpiadas ${cleared} sesión(es) corruptas para ${originalSenderJid}. Reintentando envío...`);
                                    await new Promise(r => setTimeout(r, 500));
                                }
                            } catch (cleanErr) {
                                console.error('Error al limpiar sesión:', cleanErr.message);
                            }
                        }
                    }
                }
                if (!sent) {
                    console.error(`No se pudo enviar respuesta a ${originalSenderJid} tras 2 intentos.`);
                }
            }
        } catch (err) {
            console.error('Error al responder mensaje vía IA:', err.message, err.response?.data || '');
        }
    }

    // Escuchar mensajes de WhatsApp (entrantes y salientes) y sincronizarlos con Django
    currentSock.ev.on('messages.upsert', async (m) => {
        if (currentSock !== sock) return;
        try {
            const msg = m.messages[0];
            if (!msg) return;

            let senderJid = msg.key?.remoteJid;
            console.log(`[DEBUG] Mensaje en upsert. JID: ${senderJid}, fromMe: ${msg.key?.fromMe}, hasMessage: ${!!msg.message}`);

            if (!msg.message || !senderJid) return;
            
            // Keep original JID (which could be @lid) for sending responses to the correct thread
            const originalSenderJid = senderJid;
            
            if (senderJid.endsWith('@lid')) {
                let alt = resolvePhoneJidFromMessage(msg);
                if (!alt) {
                    alt = await resolveJidToPhone(senderJid);
                }
                if (alt && alt.endsWith('@s.whatsapp.net')) {
                    console.log(`[DEBUG] Resolviendo LID ${senderJid} a ${alt}`);
                    senderJid = alt;
                    
                    const cleanPhone = formatChileanNumber(alt);
                    lidCache.set(cleanPhone, originalSenderJid);
                    console.log(`[DEBUG] Cache mapeada: ${cleanPhone} -> ${originalSenderJid}`);
                } else {
                    console.warn(`[WARNING] No se pudo resolver la JID LID ${senderJid} a número real.`);
                }
            }
            
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
            
            // Procesar en background (fire-and-forget) para no bloquear el handler de otros mensajes
            processIncomingMessage(senderJid, originalSenderJid, text, timestamp)
                .catch(err => console.error('Error no capturado en processIncomingMessage:', err.message));
        } catch (err) {
            console.error('Error en handler messages.upsert:', err.message);
        }
    });

    // Sincronizar historial de conversaciones (messaging-history.set) al vincular/conectar
    currentSock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
        if (currentSock !== sock) return;
        try {
            console.log(`Recibido evento messaging-history.set. Procesando ${messages ? messages.length : 0} mensajes del historial...`);
            
            // Map any contacts received to the cache
            if (contacts && contacts.length > 0) {
                console.log(`[DEBUG] Historial: Procesando ${contacts.length} contactos para mapeo LID...`);
                for (const c of contacts) {
                    if (c.id && c.lid) {
                        const phone = c.id.endsWith('@s.whatsapp.net') ? c.id : (c.phoneNumber ? `${c.phoneNumber}@s.whatsapp.net` : null);
                        const lid = c.lid.endsWith('@lid') ? c.lid : `${c.lid}@lid`;
                        if (phone && lid) {
                            const cleanPhone = formatChileanNumber(phone);
                            lidCache.set(cleanPhone, lid);
                        }
                    }
                    if (c.id && c.id.endsWith('@lid') && c.phoneNumber) {
                        const cleanPhone = formatChileanNumber(c.phoneNumber);
                        lidCache.set(cleanPhone, c.id);
                    }
                }
            }

            if (!messages || messages.length === 0) return;

            const formattedMessages = [];

            for (const msg of messages) {
                if (!msg.message || !msg.key) continue;

                let remoteJid = msg.key.remoteJid;
                if (!remoteJid) continue;
                
                if (remoteJid.endsWith('@lid')) {
                    let alt = resolvePhoneJidFromMessage(msg);
                    if (!alt) {
                        alt = await resolveJidToPhone(remoteJid);
                    }
                    if (alt && alt.endsWith('@s.whatsapp.net')) {
                        const cleanPhone = formatChileanNumber(alt);
                        lidCache.set(cleanPhone, remoteJid);
                        console.log(`[DEBUG] Historial: Mapeando teléfono ${cleanPhone} a LID ${remoteJid}`);
                        remoteJid = alt;
                    }
                }

                if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@lid')) continue;

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
        pairingCode: currentPairingCode,
        user: sock ? sock.user : null
    });
});

app.post('/api/request-pairing-code', requireInternalKey, async (req, res) => {
    try {
        const { number } = req.body;
        if (!number) return res.status(400).json({ error: 'Number is required' });
        
        if (!sock) return res.status(503).json({ error: 'WhatsApp service not ready' });
        
        if (sock.authState?.creds?.registered) {
           return res.status(400).json({ error: 'Phone already registered on WhatsApp' });
        }

        const cleanNumber = String(number).replace(/\D/g, '');
        const code = await sock.requestPairingCode(cleanNumber);
        currentPairingCode = code;
        
        return res.status(200).json({ success: true, code: code });
    } catch (err) {
        console.error('Error requesting pairing code:', err);
        return res.status(500).json({ error: err.message });
    }
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
        const cleanNumber = formatChileanNumber(number);
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

        // Resolve the correct target JID asynchronously
        const jid = await getToSendJid(number);
        console.log(`[DEBUG] Target JID resuelto para enviar mensaje a ${number} -> ${jid}`);
        
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`WhatsApp Microservice running on port ${PORT}`);
});

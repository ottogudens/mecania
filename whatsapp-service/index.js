const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let currentQr = null;
let connectionStatus = 'disconnected';

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We'll handle it manually for better formatting
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
        const { number, text } = req.body;
        
        if (!number || !text) {
            return res.status(400).json({ error: 'Number and text are required' });
        }
        
        if (!sock) {
            return res.status(503).json({ error: 'WhatsApp service not ready' });
        }

        // Format number to JID
        // In Baileys, standard phone numbers need @s.whatsapp.net
        const jid = `${number}@s.whatsapp.net`;
        
        await sock.sendMessage(jid, { text: text });
        
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

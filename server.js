const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

// Erhöhte Stabilität für den HTTP-Server
const server = http.createServer((req, res) => { 
    res.writeHead(200, { 'Content-Type': 'text/plain' }); 
    res.end("Schach-Ultra-Server: PROFESSIONAL EDITION AKTIV!"); 
});
const wss = new WebSocket.Server({ server });

// --- DATEI-PFADE ---
const LB_FILE = './leaderboard.json';
const USER_FILE = './userDB.json';
const BAN_FILE = './bannedIPs.json';

// --- DATEN-SPEICHER (NICHTS GELÖSCHT) ---
let leaderboard = {};
let userDB = {}; 
let bannedIPs = new Set(); 
let mutedPlayers = new Map(); 
let warnings = {}; 
let waitingPlayer = null;
let serverLocked = false; 
let slowModeDelay = 0; 
let messageHistory = new Map(); 
let lastSentMessage = new Map(); 

const adminPass = "geheim123";

// --- XSS & CODE-INJEKTION SCHUTZ ---
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

// --- SICHERES LADEN (OPTIMIERT) ---
function safeLoad() {
    try {
        if (fs.existsSync(LB_FILE)) leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8'));
        if (fs.existsSync(USER_FILE)) userDB = JSON.parse(fs.readFileSync(USER_FILE, 'utf8'));
        if (fs.existsSync(BAN_FILE)) bannedIPs = new Set(JSON.parse(fs.readFileSync(BAN_FILE, 'utf8')));
    } catch (err) { console.error("Fehler beim Laden der Dateien:", err); }
}
safeLoad();

function saveAll() {
    try {
        fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
        fs.writeFileSync(USER_FILE, JSON.stringify(userDB, null, 2));
        fs.writeFileSync(BAN_FILE, JSON.stringify([...bannedIPs], null, 2));
    } catch (err) { console.error("Fehler beim Speichern:", err); }
}

function broadcast(msgObj) {
    const msg = JSON.stringify(msgObj);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
}

// --- VERBINDUNGS-LOGIK ---
wss.on('connection', (ws, req) => {
    // IP-Erkennung für Proxies (Render/Heroku)
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    ws.clientIP = clientIP;
    ws.isAlive = true;

    // BAN-CHECK SOFORT BEIM VERBINDEN
    if (bannedIPs.has(ws.clientIP)) {
        ws.send(JSON.stringify({ type: 'chat', text: 'ZUGRIFF VERWEIGERT: IP GEBANNT!', system: true }));
        ws.terminate();
        return;
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const inputName = (data.name || data.playerName || data.sender || "").trim();
            const inputPass = data.password || "";
            if (inputName) ws.playerName = inputName;

            // --- ADMIN LOGIK (KOMPLETT & OPTIMIERT) ---
            if (data.type === 'chat' && data.text && data.text.startsWith('/') && data.text.includes(adminPass)) {
                const parts = data.text.split(' ');
                const cmd = parts[0].toLowerCase();
                const target = parts[1];
                const targetLower = target ? target.toLowerCase() : "";
                const textArg = parts.slice(1, -1).join(' ');

                // 1. VERWARNUNGSSYSTEM
                if (cmd === '/warn') {
                    warnings[targetLower] = (warnings[targetLower] || 0) + 1;
                    broadcast({ type: 'chat', text: `WARNUNG für ${target}: (${warnings[targetLower]}/3)`, system: true });
                    if(warnings[targetLower] >= 3) {
                        wss.clients.forEach(c => { if(c.playerName?.toLowerCase() === targetLower) c.terminate(); });
                    }
                    return;
                }

                // 2. BAN & KICK SYSTEM
                if (cmd === '/ban') {
                    wss.clients.forEach(c => { 
                        if(c.playerName?.toLowerCase() === targetLower) { 
                            bannedIPs.add(c.clientIP); 
                            c.terminate(); 
                        } 
                    });
                    saveAll();
                    return;
                }
                if (cmd === '/banip') { bannedIPs.add(target); saveAll(); return; }
                if (cmd === '/kick') {
                    wss.clients.forEach(c => { if(c.playerName?.toLowerCase() === targetLower) c.terminate(); });
                    return;
                }

                // 3. SERVER-STEUERUNG
                if (cmd === '/lock') { serverLocked = true; broadcast({ type: 'chat', text: "ADMIN: Server gesperrt!", system: true }); return; }
                if (cmd === '/unlock') { serverLocked = false; broadcast({ type: 'chat', text: "ADMIN: Server entsperrt!", system: true }); return; }
                if (cmd === '/slowmode') { slowModeDelay = parseInt(target) || 0; return; }
                if (cmd === '/stats') {
                    ws.send(JSON.stringify({ type: 'chat', text: `Online: ${wss.clients.size} | Gebannt: ${bannedIPs.size}`, system: true }));
                    return;
                }
                if (cmd === '/broadcast') { broadcast({ type: 'chat', text: `📢 ADMIN-INFO: ${textArg.toUpperCase()}`, system: true }); return; }
            }

            // --- LOGIN / REGISTER LOGIK ---
            if (data.type === 'join' || data.type === 'find_random') {
                if (inputName) {
                    if (!userDB[inputName]) { userDB[inputName] = inputPass; saveAll(); }
                    else if (userDB[inputName] !== inputPass) { 
                        ws.send(JSON.stringify({ type: 'chat', text: 'Passwort falsch!', system: true })); 
                        ws.terminate(); 
                        return; 
                    }
                }
            }

            // --- MULTIPLAYER & MATCHMAKING ---
            if (data.type === 'find_random') {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "game_" + Math.random().toString(36).substr(2, 9);
                    ws.room = roomID; waitingPlayer.room = roomID;
                    ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black' }));
                    waitingPlayer.send(JSON.stringify({ type: 'join', room: roomID, color: 'white' }));
                    waitingPlayer = null;
                } else { waitingPlayer = ws; }
                return;
            }

            // --- CHAT & MOVES (HOCHLEISTUNGS-VERTEILER) ---
            if (data.type === 'chat' || data.type === 'move') {
                if (serverLocked && data.type === 'move') return;
                
                if (data.type === 'chat') {
                    data.text = escapeHTML(data.text);
                    const now = Date.now();
                    const lowerName = inputName.toLowerCase();
                    // Anti-Spam & Slowmode
                    if (now - (ws.lastMessageTime || 0) < slowModeDelay * 1000) return;
                    if (mutedPlayers.has(lowerName) && now < mutedPlayers.get(lowerName)) return;
                    ws.lastMessageTime = now;
                }

                const targetRoom = data.room || ws.room;
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === targetRoom) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            // --- PRIVATE RÄUME ---
            if (data.type === 'join' && !data.type.startsWith('find_')) {
                ws.room = data.room;
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }

            // --- LEADERBOARD (OPTIMIERT) ---
            if (data.type === 'win') {
                const name = data.name || ws.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveAll();
                const top5 = Object.entries(leaderboard)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([name, wins]) => ({ name, wins }));
                broadcast({ type: 'leaderboard', list: top5 });
            }

        } catch (e) { console.error("Message Error:", e); }
    });

    ws.on('close', () => { 
        if(waitingPlayer === ws) waitingPlayer = null; 
    });
});

// Ping-Pong zur Verbindungskontrolle (verhindert Timeouts)
setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`ELITE-SERVER gestartet auf Port ${PORT}`));

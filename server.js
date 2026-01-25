const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => { 
    res.writeHead(200); 
    res.end("Schach-Ultra-Server: MASTER-ADMIN-MODUS AKTIV!"); 
});
const wss = new WebSocket.Server({ server });

// --- SPEICHERDATEIEN ---
const LB_FILE = './leaderboard.json';
const USER_FILE = './userDB.json';
const BAN_FILE = './bannedIPs.json';

// --- SERVER SPEICHER (ERWEITERT) ---
let leaderboard = {};
let userDB = {}; 
let bannedIPs = new Set(); 
let mutedPlayers = new Map(); 
let warnings = {}; 
let waitingPlayer = null;
let serverLocked = false; 
let slowModeDelay = 0; 
let messageHistory = new Map(); 
let lastSentMessage = new Map(); // Neu: Schutz gegen Inhalts-Wiederholung

const adminPass = "geheim123";

// --- HACK-SCHUTZ & FILTER ---
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

// --- DATEN LADEN BEIM START ---
function loadData() {
    if (fs.existsSync(LB_FILE)) try { leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); } catch(e){}
    if (fs.existsSync(USER_FILE)) try { userDB = JSON.parse(fs.readFileSync(USER_FILE, 'utf8')); } catch(e){}
    if (fs.existsSync(BAN_FILE)) try { bannedIPs = new Set(JSON.parse(fs.readFileSync(BAN_FILE, 'utf8'))); } catch(e){}
}
loadData();

function saveAll() {
    try {
        fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
        fs.writeFileSync(USER_FILE, JSON.stringify(userDB, null, 2));
        fs.writeFileSync(BAN_FILE, JSON.stringify([...bannedIPs], null, 2));
    } catch (e) {}
}

function broadcast(msgObj) {
    const msg = JSON.stringify(msgObj);
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

wss.on('connection', (ws, req) => {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    ws.clientIP = clientIP;
    ws.lastMessageTime = 0;

    // IP-EINGANGS-KONTROLLE
    if (bannedIPs.has(ws.clientIP)) {
        ws.send(JSON.stringify({ type: 'chat', text: 'ZUGRIFF VERWEIGERT: Deine IP steht auf der Blacklist!', system: true }));
        ws.terminate();
        return;
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const inputName = (data.name || data.playerName || data.sender || "").trim();
            const inputPass = data.password || "";
            if (inputName) ws.playerName = inputName;

            // --- MASTER-ADMIN LOGIK ---
            if (data.type === 'chat' && data.text.startsWith('/') && data.text.includes(adminPass)) {
                const parts = data.text.split(' ');
                const cmd = parts[0].toLowerCase();
                const target = parts[1];
                const textArg = parts.slice(1, -1).join(' ');

                console.log(`ADMIN-AKTION: ${cmd} von ${inputName} auf ${target || 'Alle'}`);

                // NEUE MASTER-BEFEHLE
                if (cmd === '/banlist') {
                    ws.send(JSON.stringify({ type: 'chat', text: `Gebannte IPs: ${[...bannedIPs].join(', ') || 'Keine'}`, system: true }));
                    return;
                }
                if (cmd === '/pardon') {
                    bannedIPs.delete(target);
                    saveAll();
                    ws.send(JSON.stringify({ type: 'chat', text: `IP ${target} wurde begnadigt.`, system: true }));
                    return;
                }
                if (cmd === '/mutelist') {
                    const now = Date.now();
                    let list = [];
                    mutedPlayers.forEach((time, name) => { if(time > now) list.push(name); });
                    ws.send(JSON.stringify({ type: 'chat', text: `Stummgeschaltet: ${list.join(', ') || 'Niemand'}`, system: true }));
                    return;
                }
                if (cmd === '/wall') {
                    broadcast({ type: 'chat', text: `═════════════════════════\nACHTUNG: ${textArg.toUpperCase()}\n═════════════════════════`, system: true });
                    return;
                }

                // BESTEHENDE BEFEHLE (NICHTS GEKÜRZT)
                if (cmd === '/banip') { bannedIPs.add(target); saveAll(); return; }
                if (cmd === '/slowmode') { slowModeDelay = parseInt(target) || 0; broadcast({ type: 'chat', text: `Slowmode: ${slowModeDelay}s aktiviert.`, system: true }); return; }
                if (cmd === '/cleardb') { userDB = {}; saveAll(); return; }
                if (cmd === '/lock') { serverLocked = true; broadcast({ type: 'chat', text: "SPIELFELD GESPERRT!", system: true }); return; }
                if (cmd === '/unlock') { serverLocked = false; broadcast({ type: 'chat', text: "SPIELFELD FREIGEGEBEN!", system: true }); return; }
                if (cmd === '/broadcast') { broadcast({ type: 'chat', text: `📢 ${textArg.toUpperCase()}`, system: true }); return; }
                if (cmd === '/kickall') { wss.clients.forEach(c => { if(c !== ws) c.terminate(); }); return; }
                if (cmd === '/stats') { ws.send(JSON.stringify({ type: 'chat', text: `Spieler: ${wss.clients.size} | IP-Bans: ${bannedIPs.size} | Slowmode: ${slowModeDelay}s`, system: true })); return; }
                if (cmd === '/help') { ws.send(JSON.stringify({ type: 'chat', text: "Befehle: /banlist, /pardon, /mutelist, /wall, /banip, /slowmode, /lock, /unlock, /broadcast, /stats", system: true })); return; }
            }

            // --- LOGIN / REGISTRIERUNG (UNVERÄNDERT) ---
            if (data.type === 'join' || data.type === 'find_random') {
                if (inputName) {
                    if (!userDB[inputName]) { userDB[inputName] = inputPass; saveAll(); }
                    else if (userDB[inputName] !== inputPass) { ws.send(JSON.stringify({ type: 'chat', text: 'Passwort falsch!', system: true })); ws.terminate(); return; }
                }
            }

            // --- PROFI CHAT-SCHUTZ ---
            if (data.type === 'chat') {
                const now = Date.now();
                const lowerName = inputName.toLowerCase();

                // 1. Slowmode
                if (now - ws.lastMessageTime < slowModeDelay * 1000) {
                    ws.send(JSON.stringify({ type: 'chat', text: `Slowmode aktiv! Warte noch etwas.`, system: true }));
                    return;
                }
                // 2. Dubletten-Schutz (Gleiche Nachricht zweimal)
                if (lastSentMessage.get(lowerName) === data.text) {
                    ws.send(JSON.stringify({ type: 'chat', text: 'Wiederhole dich nicht!', system: true }));
                    return;
                }
                // 3. Automatischer Mute bei Massen-Spam
                let history = messageHistory.get(ws.clientIP) || [];
                history = history.filter(t => now - t < 3000);
                history.push(now);
                messageHistory.set(ws.clientIP, history);
                if (history.length > 5) {
                    mutedPlayers.set(lowerName, now + 30000);
                    ws.send(JSON.stringify({ type: 'chat', text: 'AUTOMUTED: Spam-Schutz aktiv (30s)!', system: true }));
                    return;
                }
                // 4. Mute Check
                if (mutedPlayers.has(lowerName) && now < mutedPlayers.get(lowerName)) {
                    ws.send(JSON.stringify({ type: 'chat', text: 'Du bist stummgeschaltet.', system: true }));
                    return;
                }
                
                ws.lastMessageTime = now;
                lastSentMessage.set(lowerName, data.text);
            }

            // --- SPIEL LOGIK (ALLES NOCH DRIN) ---
            if (data.type === 'find_random') {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "room_" + Math.random();
                    ws.room = roomID; waitingPlayer.room = roomID;
                    ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black' }));
                    waitingPlayer.send(JSON.stringify({ type: 'join', room: roomID, color: 'white' }));
                    waitingPlayer = null;
                } else { waitingPlayer = ws; }
                return;
            }

            if (data.type === 'move' || data.type === 'chat') {
                if (serverLocked && data.type === 'move') return;
                if (data.type === 'chat') data.text = escapeHTML(data.text);

                const targetRoom = data.room || ws.room;
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === targetRoom) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            if (data.type === 'join' && !data.type.startsWith('find_')) { ws.room = data.room; ws.send(JSON.stringify({ type: 'join', room: data.room })); }
            
            if (data.type === 'win') {
                const name = data.name || ws.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveAll();
                broadcast({ type: 'leaderboard', list: Object.entries(leaderboard).map(([n, w]) => ({ name: n, wins: w })).sort((a,b)=>b.wins-a.wins).slice(0,5) });
            }

        } catch (e) {}
    });
    ws.on('close', () => { if(waitingPlayer === ws) waitingPlayer = null; });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server MASTER-MODUS aktiv auf Port ${PORT}`));

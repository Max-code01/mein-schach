const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

// --- SERVER SETUP ---
const server = http.createServer((req, res) => { 
    res.writeHead(200); 
    res.end("Schach-Ultra-Server: ABSOLUTE KOMPLETT-VERSION"); 
});
const wss = new WebSocket.Server({ server });

// --- DATEIEN ---
const LB_FILE = './leaderboard.json';
const USER_FILE = './userDB.json';
const BAN_FILE = './bannedIPs.json';

// --- SERVER SPEICHER (ALLE VARIABLEN) ---
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

// --- SICHERHEITS-LOGIK ---
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
}

// --- DATEN LADEN ---
function loadData() {
    if (fs.existsSync(LB_FILE)) {
        try { leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); } catch (e) {}
    }
    if (fs.existsSync(USER_FILE)) {
        try { userDB = JSON.parse(fs.readFileSync(USER_FILE, 'utf8')); } catch (e) {}
    }
    if (fs.existsSync(BAN_FILE)) {
        try { 
            const savedIPs = JSON.parse(fs.readFileSync(BAN_FILE, 'utf8'));
            bannedIPs = new Set(savedIPs);
        } catch (e) {}
    }
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
    wss.clients.forEach(function(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// --- HAUPT-LOGIK ---
wss.on('connection', function(ws, req) {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    ws.clientIP = clientIP;
    ws.lastMessageTime = 0;

    // IP-CHECK
    if (bannedIPs.has(ws.clientIP)) {
        ws.send(JSON.stringify({ type: 'chat', text: 'ZUGRIFF VERWEIGERT: IP GEBANNT!', system: true }));
        ws.terminate();
        return;
    }

    ws.on('message', function(message) {
        try {
            const data = JSON.parse(message);
            const inputName = (data.name || data.playerName || data.sender || "").trim();
            const inputPass = data.password || "";
            if (inputName) ws.playerName = inputName;

            // --- ADMIN LOGIK (HIER SIND ALLE 17 BEFEHLE) ---
            if (data.type === 'chat' && data.text.startsWith('/') && data.text.includes(adminPass)) {
                const parts = data.text.split(' ');
                const cmd = parts[0].toLowerCase();
                const target = parts[1];
                const targetLower = target ? target.toLowerCase() : "";
                const textArg = parts.slice(1, -1).join(' ');

                // 1. /warn
                if (cmd === '/warn') {
                    warnings[targetLower] = (warnings[targetLower] || 0) + 1;
                    broadcast({ type: 'chat', text: `WARNUNG: ${target} (${warnings[targetLower]}/3)`, system: true });
                    if (warnings[targetLower] >= 3) {
                        wss.clients.forEach(c => { if(c.playerName?.toLowerCase() === targetLower) c.terminate(); });
                    }
                    return;
                }

                // 2. /mute
                if (cmd === '/mute') {
                    mutedPlayers.set(targetLower, Date.now() + 3600000); // 1 Std
                    ws.send(JSON.stringify({ type: 'chat', text: target + " stummgeschaltet.", system: true }));
                    return;
                }

                // 3. /unmute (WIEDER DA!)
                if (cmd === '/unmute') {
                    mutedPlayers.delete(targetLower);
                    ws.send(JSON.stringify({ type: 'chat', text: target + " kann wieder schreiben.", system: true }));
                    return;
                }

                // 4. /kick
                if (cmd === '/kick') {
                    wss.clients.forEach(c => { if(c.playerName?.toLowerCase() === targetLower) c.terminate(); });
                    return;
                }

                // 5. /ban
                if (cmd === '/ban') {
                    wss.clients.forEach(c => { if(c.playerName?.toLowerCase() === targetLower) { bannedIPs.add(c.clientIP); c.terminate(); } });
                    saveAll(); return;
                }

                // 6. /banip
                if (cmd === '/banip') { bannedIPs.add(target); saveAll(); return; }

                // 7. /pardon
                if (cmd === '/pardon') { bannedIPs.delete(target); saveAll(); return; }

                // 8. /kickall
                if (cmd === '/kickall') { wss.clients.forEach(c => { if(c !== ws) c.terminate(); }); return; }

                // 9. /lock
                if (cmd === '/lock') { serverLocked = true; broadcast({ type: 'chat', text: "SERVER GESPERRT", system: true }); return; }

                // 10. /unlock
                if (cmd === '/unlock') { serverLocked = false; broadcast({ type: 'chat', text: "SERVER FREIGEGEBEN", system: true }); return; }

                // 11. /slowmode
                if (cmd === '/slowmode') { slowModeDelay = parseInt(target) || 0; return; }

                // 12. /stats
                if (cmd === '/stats') { ws.send(JSON.stringify({ type: 'chat', text: `Spieler: ${wss.clients.size} | Bans: ${bannedIPs.size}`, system: true })); return; }

                // 13. /banlist
                if (cmd === '/banlist') { ws.send(JSON.stringify({ type: 'chat', text: `Bans: ${[...bannedIPs].join(', ')}`, system: true })); return; }

                // 14. /mutelist
                if (cmd === '/mutelist') { 
                    let list = Array.from(mutedPlayers.keys()).join(', ');
                    ws.send(JSON.stringify({ type: 'chat', text: `Stumm: ${list || 'Keiner'}`, system: true })); 
                    return; 
                }

                // 15. /broadcast & /wall
                if (cmd === '/broadcast') { broadcast({ type: 'chat', text: "📢 " + textArg.toUpperCase(), system: true }); return; }
                if (cmd === '/wall') { broadcast({ type: 'chat', text: "═══════════════\n" + textArg.toUpperCase() + "\n═══════════════", system: true }); return; }

                // 16. /reset
                if (cmd === '/reset') {
                    wss.clients.forEach(c => { if(c.room === ws.room) c.send(JSON.stringify({ type: 'join', room: ws.room })); });
                    return;
                }

                // 17. /help
                if (cmd === '/help') {
                    ws.send(JSON.stringify({ type: 'chat', text: "Befehle: /warn, /mute, /unmute, /kick, /ban, /banip, /pardon, /stats, /lock, /unlock, /slowmode, /broadcast, /wall, /reset", system: true }));
                    return;
                }
            }

            // --- SPIEL-LOGIK (RANDOM MATCHING) ---
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

            // --- CHAT & MOVES ---
            if (data.type === 'chat' || data.type === 'move') {
                if (serverLocked && data.type === 'move') return;
                
                if (data.type === 'chat') {
                    data.text = escapeHTML(data.text);
                    const now = Date.now();
                    const lowerName = inputName.toLowerCase();
                    if (now - ws.lastMessageTime < slowModeDelay * 1000) return;
                    if (mutedPlayers.has(lowerName) && now < mutedPlayers.get(lowerName)) {
                        ws.send(JSON.stringify({ type: 'chat', text: 'Du bist stummgeschaltet!', system: true }));
                        return;
                    }
                    ws.lastMessageTime = now;
                }

                const targetRoom = data.room || ws.room;
                wss.clients.forEach(function(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === targetRoom) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            // --- JOIN & LEADERBOARD ---
            if (data.type === 'join' && !data.type.startsWith('find_')) {
                if (inputName) {
                    if (!userDB[inputName]) { userDB[inputName] = inputPass; saveAll(); }
                    else if (userDB[inputName] !== inputPass) { ws.terminate(); return; }
                }
                ws.room = data.room; ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }

            if (data.type === 'win') {
                const name = data.name || ws.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveAll();
                const sorted = Object.entries(leaderboard).sort((a,b) => b[1]-a[1]).slice(0,5);
                broadcast({ type: 'leaderboard', list: sorted.map(e => ({ name: e[0], wins: e[1] })) });
            }

        } catch (e) {}
    });
    ws.on('close', function() { if (waitingPlayer === ws) waitingPlayer = null; });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log("Server läuft auf " + PORT));

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => { 
    res.writeHead(200); 
    res.end("Schach-Ultra-Server: Maximale Admin-Power aktiv!"); 
});
const wss = new WebSocket.Server({ server });

// --- DATEIEN ---
const LB_FILE = './leaderboard.json';
const USER_FILE = './userDB.json';
const BAN_FILE = './bannedIPs.json';

// --- SPEICHER ---
let leaderboard = {};
let userDB = {}; 
let bannedPlayers = new Set(); 
let bannedIPs = new Set(); 
let mutedPlayers = new Set(); 
let warnings = {}; // Speichert Verwarnungen
let waitingPlayer = null;

const adminPass = "geheim123";

// --- SICHERHEITS-FILTER ---
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[m]);
}

// --- LADEN BEIM START ---
if (fs.existsSync(LB_FILE)) try { leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); } catch (e) {}
if (fs.existsSync(USER_FILE)) try { userDB = JSON.parse(fs.readFileSync(USER_FILE, 'utf8')); } catch (e) {}
if (fs.existsSync(BAN_FILE)) {
    try { 
        const savedIPs = JSON.parse(fs.readFileSync(BAN_FILE, 'utf8'));
        bannedIPs = new Set(savedIPs);
    } catch (e) {}
}

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

    if (bannedIPs.has(ws.clientIP)) {
        ws.send(JSON.stringify({ type: 'chat', text: 'ZUGRIFF VERWEIGERT: Deine IP ist gesperrt!', sender: 'SYSTEM', system: true }));
        ws.terminate();
        return;
    }

    const list = Object.entries(leaderboard).map(([name, wins]) => ({ name, wins })).sort((a,b)=>b.wins-a.wins).slice(0,5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const inputName = (data.name || data.playerName || data.sender || "").trim();
            const inputPass = data.password || "";

            if (inputName) ws.playerName = inputName;

            // --- ADMIN LOGIK (KOMPLETT) ---
            if (data.type === 'chat' && data.text.startsWith('/') && data.text.includes(adminPass)) {
                const parts = data.text.split(' ');
                const cmd = parts[0].toLowerCase();
                const target = parts[1];
                const targetLower = target ? target.toLowerCase() : "";
                const textArg = parts.slice(1, -1).join(' ');

                // HILFE-BEFEHL
                if (cmd === '/help') {
                    const helpText = "BEFEHLE: /kick, /ban, /unban, /mute, /unmute, /say, /announce, /checkip, /kickall, /listbans, /stats, /warn, /clearleaderboard";
                    ws.send(JSON.stringify({ type: 'chat', text: helpText, sender: 'SYSTEM', system: true }));
                    return;
                }

                // STATS-BEFEHL
                if (cmd === '/stats') {
                    const stats = `Online: ${wss.clients.size} | Gebannt: ${bannedIPs.size} | Muted: ${mutedPlayers.size}`;
                    ws.send(JSON.stringify({ type: 'chat', text: stats, sender: 'SYSTEM', system: true }));
                    return;
                }

                // WARN-BEFEHL
                if (cmd === '/warn') {
                    warnings[targetLower] = (warnings[targetLower] || 0) + 1;
                    broadcast({ type: 'chat', text: `WARNUNG: ${target} wurde verwarnt! (${warnings[targetLower]}/3)`, sender: 'SYSTEM', system: true });
                    if(warnings[targetLower] >= 3) {
                        wss.clients.forEach(c => { if(c.playerName && c.playerName.toLowerCase() === targetLower) c.terminate(); });
                        broadcast({ type: 'chat', text: `${target} wurde nach 3 Warnungen automatisch gekickt.`, sender: 'SYSTEM', system: true });
                        warnings[targetLower] = 0;
                    }
                    return;
                }

                // KICK
                if (cmd === '/kick') {
                    wss.clients.forEach(c => { if (c.playerName && c.playerName.toLowerCase() === targetLower) c.terminate(); });
                    broadcast({ type: 'chat', text: `Spieler ${target} wurde gekickt.`, sender: 'SYSTEM', system: true });
                    return;
                }

                // BAN
                if (cmd === '/ban') {
                    bannedPlayers.add(targetLower);
                    wss.clients.forEach(c => { 
                        if (c.playerName && c.playerName.toLowerCase() === targetLower) { 
                            bannedIPs.add(c.clientIP); c.terminate(); 
                        } 
                    });
                    saveAll();
                    broadcast({ type: 'chat', text: `Spieler ${target} wurde permanent gebannt.`, sender: 'SYSTEM', system: true });
                    return;
                }

                // UNBAN
                if (cmd === '/unban') {
                    bannedPlayers.delete(targetLower);
                    bannedIPs.delete(target);
                    saveAll();
                    ws.send(JSON.stringify({ type: 'chat', text: `${target} wurde entbannt.`, sender: 'SYSTEM', system: true }));
                    return;
                }

                // MUTE
                if (cmd === '/mute') {
                    mutedPlayers.add(targetLower);
                    broadcast({ type: 'chat', text: `${target} wurde stummgeschaltet.`, sender: 'SYSTEM', system: true });
                    return;
                }

                // UNMUTE
                if (cmd === '/unmute') {
                    mutedPlayers.delete(targetLower);
                    broadcast({ type: 'chat', text: `${target} darf wieder chatten.`, sender: 'SYSTEM', system: true });
                    return;
                }

                // SAY
                if (cmd === '/say') {
                    broadcast({ type: 'chat', text: `📢 ADMIN: ${textArg}`, sender: 'ADMIN', system: true });
                    return;
                }

                // ANNOUNCE
                if (cmd === '/announce') {
                    broadcast({ type: 'chat', text: `🛑 WICHTIG: ${textArg.toUpperCase()} 🛑`, sender: 'SYSTEM', system: true });
                    return;
                }

                // CHECKIP
                if (cmd === '/checkip') {
                    wss.clients.forEach(c => { 
                        if (c.playerName && c.playerName.toLowerCase() === targetLower) { 
                            ws.send(JSON.stringify({ type: 'chat', text: `IP von ${target}: ${c.clientIP}`, sender: 'SYSTEM', system: true }));
                        } 
                    });
                    return;
                }

                // KICKALL
                if (cmd === '/kickall') {
                    wss.clients.forEach(c => { if (c !== ws) c.terminate(); });
                    broadcast({ type: 'chat', text: `Alle Spieler wurden entfernt!`, sender: 'SYSTEM', system: true });
                    return;
                }

                // LISTBANS
                if (cmd === '/listbans') {
                    ws.send(JSON.stringify({ type: 'chat', text: `Bans: ${[...bannedPlayers].join(', ')} | IPs: ${[...bannedIPs].join(', ')}`, sender: 'SYSTEM', system: true }));
                    return;
                }

                // CLEARLEADERBOARD
                if (cmd === '/clearleaderboard') {
                    leaderboard = {}; saveAll();
                    broadcast({ type: 'leaderboard', list: [] });
                    return;
                }
            }

            // --- SPIEL LOGIK ---
            if (data.type === 'join' || data.type === 'find_random') {
                if (inputName) {
                    if (!userDB[inputName]) {
                        userDB[inputName] = inputPass;
                        saveAll();
                    } else if (userDB[inputName] !== inputPass) {
                        ws.send(JSON.stringify({ type: 'chat', text: 'LOGIN-FEHLER: Passwort falsch!', sender: 'SYSTEM', system: true }));
                        ws.terminate();
                        return;
                    }
                }
            }

            if (data.type === 'find_random') {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "random_" + Math.random();
                    ws.room = roomID;
                    waitingPlayer.room = roomID;
                    ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black', systemMsg: "Gegner gefunden!" }));
                    waitingPlayer.send(JSON.stringify({ type: 'join', room: roomID, color: 'white', systemMsg: "Gegner gefunden!" }));
                    waitingPlayer = null;
                } else {
                    waitingPlayer = ws;
                }
                return;
            }

            if (data.type === 'chat' || data.type === 'move') {
                if (data.type === 'chat' && data.text) {
                    data.text = escapeHTML(data.text);
                }

                if (data.type === 'chat' && ws.playerName && mutedPlayers.has(ws.playerName.toLowerCase())) {
                    ws.send(JSON.stringify({ type: 'chat', text: 'SYSTEM: Du bist stummgeschaltet!', sender: 'SYSTEM', system: true }));
                    return;
                }

                const targetRoom = data.room || ws.room;
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === targetRoom) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            if (data.type === 'join' && !data.type.startsWith('find_')) {
                ws.room = data.room;
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }

            if (data.type === 'win') {
                const name = data.name || ws.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveAll();
                const updatedList = Object.entries(leaderboard).map(([n, w]) => ({ name: n, wins: w })).sort((a,b)=>b.wins-a.wins).slice(0,5);
                broadcast({ type: 'leaderboard', list: updatedList });
            }

            const countMsg = JSON.stringify({ type: 'user-count', count: wss.clients.size });
            wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(countMsg); });

        } catch (e) {}
    });

    ws.on('close', () => { if(waitingPlayer === ws) waitingPlayer = null; });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server aktiv auf Port ${PORT}`));

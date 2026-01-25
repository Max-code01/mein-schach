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
let waitingPlayer = null;

const adminPass = "geheim123";

// --- NEU: SICHERHEITS-FILTER (HINZUGEFÜGT) ---
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

            if (data.type === 'chat' && data.text.startsWith('/') && data.text.includes(adminPass)) {
                const parts = data.text.split(' ');
                const cmd = parts[0].toLowerCase();
                const target = parts[1];
                const targetLower = target ? target.toLowerCase() : "";
                const textArg = parts.slice(1, -1).join(' ');

                if (cmd === '/kick') {
                    wss.clients.forEach(c => { 
                        if (c.playerName && c.playerName.toLowerCase() === targetLower) c.terminate(); 
                    });
                    broadcast({ type: 'chat', text: `Spieler ${target} wurde gekickt.`, sender: 'SYSTEM', system: true });
                    return;
                }

                if (cmd === '/ban') {
                    bannedPlayers.add(targetLower);
                    wss.clients.forEach(c => { 
                        if (c.playerName && c.playerName.toLowerCase() === targetLower) { 
                            bannedIPs.add(c.clientIP); 
                            c.terminate(); 
                        } 
                    });
                    saveAll();
                    broadcast({ type: 'chat', text: `Spieler ${target} wurde permanent gebannt.`, sender: 'SYSTEM', system: true });
                    return;
                }

                if (cmd === '/unban') {
                    bannedPlayers.delete(targetLower);
                    bannedIPs.delete(target);
                    saveAll();
                    ws.send(JSON.stringify({ type: 'chat', text: `${target} wurde entbannt.`, sender: 'SYSTEM', system: true }));
                    return;
                }

                if (cmd === '/mute') {
                    mutedPlayers.add(targetLower);
                    broadcast({ type: 'chat', text: `${target} wurde stummgeschaltet.`, sender: 'SYSTEM', system: true });
                    return;
                }

                if (cmd === '/unmute') {
                    mutedPlayers.delete(targetLower);
                    broadcast({ type: 'chat', text: `${target} darf wieder chatten.`, sender: 'SYSTEM', system: true });
                    return;
                }

                if (cmd === '/say') {
                    broadcast({ type: 'chat', text: `📢 ADMIN: ${textArg}`, sender: 'ADMIN', system: true });
                    return;
                }

                if (cmd === '/listbans') {
                    ws.send(JSON.stringify({ type: 'chat', text: `Bans: ${[...bannedPlayers].join(', ')} | IPs: ${[...bannedIPs].join(', ')}`, sender: 'SYSTEM', system: true }));
                    return;
                }

                if (cmd === '/clearleaderboard') {
                    leaderboard = {}; saveAll();
                    broadcast({ type: 'leaderboard', list: [] });
                    return;
                }
            }

            if (data.type === 'join' || data.type === 'find_random') {
                if (inputName) {
                    if (!userDB[inputName]) {
                        userDB[inputName] = inputPass;
                        saveAll();
                    } else if (userDB[inputName] !== inputPass) {
                        ws.send(JSON.stringify({ type: 'chat', text: 'LOGIN-FEHLER: Falsches Passwort!', sender: 'SYSTEM', system: true }));
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
                    
                    ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black', systemMsg: "Gegner gefunden! Du bist Schwarz." }));
                    waitingPlayer.send(JSON.stringify({ type: 'join', room: roomID, color: 'white', systemMsg: "Gegner gefunden! Du bist Weiß." }));
                    waitingPlayer = null;
                } else {
                    waitingPlayer = ws;
                }
                return;
            }

            if (data.type === 'chat' || data.type === 'move') {
                // NEU: SICHERHEIT (HINZUGEFÜGT)
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
                return;
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
server.listen(PORT, () => console.log(`Server läuft stabil auf Port ${PORT}`));

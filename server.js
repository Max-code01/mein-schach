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

// --- SICHERHEITS-FILTER (GEGEN HACKS) ---
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
    // IP-Erkennung verbessert
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

            // --- VERBESSERTE ADMIN-LOGIK ---
            if (data.type === 'chat' && data.text.startsWith('/') && data.text.includes(adminPass)) {
                const parts = data.text.split(' ');
                const cmd = parts[0].toLowerCase();
                const target = parts[1];
                const targetLower = target ? target.toLowerCase() : "";
                
                // Extrahiert den Text für /say oder /announce (alles zwischen Befehl und Passwort)
                const textArg = parts.slice(1, -1).join(' ');

                // 1. KICK
                if (cmd === '/kick') {
                    wss.clients.forEach(c => { 
                        if (c.playerName && c.playerName.toLowerCase() === targetLower) c.terminate(); 
                    });
                    broadcast({ type: 'chat', text: `Spieler ${target} wurde gekickt.`, sender: 'SYSTEM', system: true });
                    return;
                }

                // 2. BAN (Name + IP)
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

                // 3. UNBAN
                if (cmd === '/unban') {
                    bannedPlayers.delete(targetLower);
                    bannedIPs.delete(target); // target kann hier auch eine IP sein
                    saveAll();
                    ws.send(JSON.stringify({ type: 'chat', text: `${target} wurde entbannt.`, sender: 'SYSTEM', system: true }));
                    return;
                }

                // 4. MUTE
                if (cmd === '/mute') {
                    mutedPlayers.add(targetLower);
                    broadcast({ type: 'chat', text: `${target} wurde stummgeschaltet.`, sender: 'SYSTEM', system: true });
                    return;
                }

                // 5. UNMUTE
                if (cmd === '/unmute') {
                    mutedPlayers.delete(targetLower);
                    broadcast({ type: 'chat', text: `${target} darf wieder chatten.`, sender: 'SYSTEM', system: true });
                    return;
                }

                // 6. SAY (Als Admin sprechen)
                if (cmd === '/say') {
                    broadcast({ type: 'chat', text: `📢 ADMIN: ${textArg}`, sender: 'ADMIN', system: true });
                    return;
                }

                // --- NEUE EXKLUSIVE BEFEHLE ---

                // 7. CHECKIP (Wer ist das?)
                if (cmd === '/checkip') {
                    let found = false;
                    wss.clients.forEach(c => { 
                        if (c.playerName && c.playerName.toLowerCase() === targetLower) { 
                            ws.send(JSON.stringify({ type: 'chat', text: `INFO: ${target} nutzt IP: ${c.clientIP}`, sender: 'SYSTEM', system: true }));
                            found = true;
                        } 
                    });
                    if(!found) ws.send(JSON.stringify({ type: 'chat', text: `Spieler ${target} nicht gefunden.`, sender: 'SYSTEM', system: true }));
                    return;
                }

                // 8. ANNOUNCE (Fett für alle)
                if (cmd === '/announce') {
                    broadcast({ type: 'chat', text: `🛑 WICHTIG: ${textArg.toUpperCase()} 🛑`, sender: 'SYSTEM', system: true });
                    return;
                }

                // 9. KICKALL (Server leerfegen)
                if (cmd === '/kickall') {
                    wss.clients.forEach(c => { if (c !== ws) c.terminate(); });
                    broadcast({ type: 'chat', text: `Alle Spieler wurden vom Admin entfernt!`, sender: 'SYSTEM', system: true });
                    return;
                }

                // 10. LISTBANS
                if (cmd === '/listbans') {
                    ws.send(JSON.stringify({ type: 'chat', text: `Bans: ${[...bannedPlayers].join(', ') || 'Keine'} | IPs: ${[...bannedIPs].join(', ') || 'Keine'}`, sender: 'SYSTEM', system: true }));
                    return;
                }

                // 11. CLEARLEADERBOARD
                if (cmd === '/clearleaderboard') {
                    leaderboard = {}; saveAll();
                    broadcast({ type: 'leaderboard', list: [] });
                    ws.send(JSON.stringify({ type: 'chat', text: `Leaderboard wurde gelöscht.`, sender: 'SYSTEM', system: true }));
                    return;
                }
            }

            // --- NORMALES GAME-HANDLING (NICHTS GELÖSCHT) ---
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
                // SICHERHEIT: HTML-Säuberung
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
server.listen(PORT, () => console.log(`Server läuft mit 11 Admin-Befehlen auf Port ${PORT}`));

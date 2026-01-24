const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => { 
    res.writeHead(200); 
    res.end("Schach-Ultra-Server: Alles aktiv!"); 
});
const wss = new WebSocket.Server({ server });

// --- DATEI-PFADE ---
const LB_FILE = './leaderboard.json';
const USER_FILE = './userDB.json';
const BAN_FILE = './bannedIPs.json';

// --- SPEICHER-OBJEKTE ---
let leaderboard = {};
let userDB = {}; 
let bannedPlayers = new Set(); 
let bannedIPs = new Set(); 
let mutedPlayers = new Set(); 
let waitingPlayer = null;

const adminPass = "geheim123"; // Dein Admin-Passwort

// --- BEIM START LADEN ---
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
    } catch (e) { console.error("Speicherfehler:", e); }
}

function broadcast(msgObj) {
    const msg = JSON.stringify(msgObj);
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

wss.on('connection', (ws, req) => {
    // IP-ERMITTLUNG
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    ws.clientIP = clientIP;

    // SOFORT-BAN CHECK (IP)
    if (bannedIPs.has(ws.clientIP)) {
        ws.send(JSON.stringify({ type: 'chat', text: 'ZUGRIFF VERWEIGERT: Deine IP ist permanent gebannt!', sender: 'SYSTEM' }));
        ws.terminate();
        return;
    }

    // Leaderboard beim Connect schicken
    const list = Object.entries(leaderboard).map(([name, wins]) => ({ name, wins })).sort((a,b)=>b.wins-a.wins).slice(0,5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const inputName = (data.name || data.playerName || data.sender || "").trim();
            const inputPass = data.password || "";

            if (inputName) ws.playerName = inputName;

            // --- ADMIN-LOGIK ---
            if (data.type === 'chat' && data.text.startsWith('/') && data.text.includes(adminPass)) {
                const parts = data.text.split(' ');
                const cmd = parts[0].toLowerCase();
                const target = parts[1];
                const textArg = parts.slice(1, -1).join(' '); // Für /say

                if (cmd === '/kick') {
                    wss.clients.forEach(c => { if (c.playerName === target) c.terminate(); });
                    broadcast({ type: 'chat', text: `Spieler ${target} wurde gekickt.`, sender: 'SYSTEM', system: true });
                    return;
                }
                if (cmd === '/ban') {
                    bannedPlayers.add(target);
                    wss.clients.forEach(c => { 
                        if (c.playerName === target) { bannedIPs.add(c.clientIP); c.terminate(); } 
                    });
                    saveAll();
                    broadcast({ type: 'chat', text: `Spieler ${target} wurde permanent verbannt (IP-Ban).`, sender: 'SYSTEM', system: true });
                    return;
                }
                if (cmd === '/unban') {
                    bannedPlayers.delete(target); bannedIPs.delete(target);
                    saveAll();
                    ws.send(JSON.stringify({ type: 'chat', text: `${target} wurde entbannt.`, sender: 'SYSTEM' }));
                    return;
                }
                if (cmd === '/mute') {
                    mutedPlayers.add(target);
                    broadcast({ type: 'chat', text: `${target} wurde stummgeschaltet.`, sender: 'SYSTEM', system: true });
                    return;
                }
                if (cmd === '/unmute') {
                    mutedPlayers.delete(target);
                    broadcast({ type: 'chat', text: `${target} darf wieder schreiben.`, sender: 'SYSTEM', system: true });
                    return;
                }
                if (cmd === '/say') {
                    broadcast({ type: 'chat', text: `📢 ADMIN: ${textArg}`, sender: 'ADMIN', system: true });
                    return;
                }
                if (cmd === '/listbans') {
                    ws.send(JSON.stringify({ type: 'chat', text: `Bans: ${[...bannedPlayers].join(', ')} | IPs: ${[...bannedIPs].join(', ')}`, sender: 'SYSTEM' }));
                    return;
                }
                if (cmd === '/clearleaderboard') {
                    leaderboard = {}; saveAll();
                    broadcast({ type: 'leaderboard', list: [] });
                    return;
                }
            }

            // --- LOGIN & NICK-SCHUTZ ---
            if (data.type === 'join' || data.type === 'find_random') {
                if (inputName) {
                    if (!userDB[inputName]) {
                        userDB[inputName] = inputPass;
                        saveAll();
                    } else if (userDB[inputName] !== inputPass) {
                        ws.send(JSON.stringify({ type: 'chat', text: 'LOGIN FEHLGESCHLAGEN: Falsches Passwort!', sender: 'SYSTEM' }));
                        ws.terminate();
                        return;
                    }
                }
            }

            // --- RANDOM MATCHING ---
            if (data.type === 'find_random') {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "random_" + Math.random();
                    ws.room = roomID;
                    waitingPlayer.room = roomID;
                    // Sende Farben (Wichtig für Brett-Drehung in script.js)
                    ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black', systemMsg: "Gegner gefunden! Du bist Schwarz." }));
                    waitingPlayer.send(JSON.stringify({ type: 'join', room: roomID, color: 'white', systemMsg: "Gegner gefunden! Du bist Weiß." }));
                    waitingPlayer = null;
                } else {
                    waitingPlayer = ws;
                }
                return;
            }

            // --- RAUM-JOIN & WEITERLEITUNG ---
            if (data.type === 'join' && !data.type.startsWith('find_')) {
                ws.room = data.room;
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
                return;
            }

            if (data.type === 'chat' || data.type === 'move') {
                if (data.type === 'chat' && mutedPlayers.has(ws.playerName)) {
                    ws.send(JSON.stringify({ type: 'chat', text: 'Du bist stummgeschaltet!', sender: 'SYSTEM' }));
                    return;
                }
                const targetRoom = data.room || ws.room;
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === targetRoom) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            // --- SIEG-LOGIK ---
            if (data.type === 'win') {
                const name = data.name || ws.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveAll();
                const updatedList = Object.entries(leaderboard).map(([n, w]) => ({ name: n, wins: w })).sort((a,b)=>b.wins-a.wins).slice(0,5);
                broadcast({ type: 'leaderboard', list: updatedList });
            }

            // User-Counter
            const countMsg = JSON.stringify({ type: 'user-count', count: wss.clients.size });
            wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(countMsg); });

        } catch (e) {}
    });

    ws.on('close', () => { if(waitingPlayer === ws) waitingPlayer = null; });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));

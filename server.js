const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => { 
    res.writeHead(200); 
    res.end("Schach-Server mit IP-Ban und Unban-Funktion läuft!"); 
});
const wss = new WebSocket.Server({ server });

// --- PERMANENTE SPEICHERUNG ---
const LB_FILE = './leaderboard.json';
const USER_FILE = './userDB.json';
let leaderboard = {};
let userDB = {}; 
let bannedPlayers = new Set(); 
let bannedIPs = new Set(); // NEU: Speicher für IP-Banns
let mutedPlayers = new Set(); 

const adminPass = "geheim123"; // Dein Admin-Passwort

if (fs.existsSync(LB_FILE)) {
    try { leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); } catch (e) { leaderboard = {}; }
}
if (fs.existsSync(USER_FILE)) {
    try { userDB = JSON.parse(fs.readFileSync(USER_FILE, 'utf8')); } catch (e) { userDB = {}; }
}

function saveLeaderboard() {
    try { fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2)); } catch (e) { console.error("Speicherfehler:", e); }
}

function saveUsers() {
    try { fs.writeFileSync(USER_FILE, JSON.stringify(userDB, null, 2)); } catch (e) { console.error("User-Speicherfehler:", e); }
}

function broadcastSystemMsg(text) {
    const msg = JSON.stringify({ type: 'chat', text: text, sender: 'System', system: true });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

let waitingPlayer = null;

wss.on('connection', (ws, req) => {
    // IP-Adresse des Clients ermitteln
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    ws.clientIP = clientIP;

    // Leaderboard beim Connect schicken
    const list = Object.entries(leaderboard).map(([name, wins]) => ({ name, wins })).sort((a,b)=>b.wins-a.wins).slice(0,5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const inputName = (data.name || data.playerName || data.sender || "").trim();
            const inputPass = data.password || "";

            // IP-CHECK: Sofort trennen, wenn IP gebannt ist
            if (bannedIPs.has(ws.clientIP)) {
                ws.send(JSON.stringify({ type: 'chat', text: 'DEINE IP IST GEBANNT!', sender: 'SYSTEM', system: true }));
                ws.terminate();
                return;
            }

            // SICHERHEITS-CHECK: Namen am Socket merken
            if (inputName) ws.playerName = inputName;

            // --- NICKNAME-SCHUTZ LOGIK ---
            if (data.type === 'join' || data.type === 'find_random') {
                if (inputName) {
                    if (!userDB[inputName]) {
                        userDB[inputName] = inputPass;
                        saveUsers();
                    } else {
                        if (userDB[inputName] !== inputPass) {
                            ws.send(JSON.stringify({ type: 'chat', text: 'NICK GESCHÜTZT! Falsches Passwort.', sender: 'System', system: true }));
                            ws.terminate();
                            return;
                        }
                    }
                }
            }

            // NAMEN-BAN-CHECK
            if (ws.playerName && bannedPlayers.has(ws.playerName)) {
                ws.terminate();
                return;
            }

            // --- ADMIN BEFEHLE ---
            if (data.type === 'chat' && data.text.startsWith('/') && data.text.includes(adminPass)) {
                const parts = data.text.split(' ');
                const cmd = parts[0].toLowerCase();
                const target = parts[1];

                // KICK & BAN (mit IP)
                if (cmd === '/kick' || cmd === '/ban') {
                    if (cmd === '/ban') {
                        bannedPlayers.add(target);
                    }
                    
                    wss.clients.forEach(client => {
                        if (client.playerName === target) {
                            if (cmd === '/ban') bannedIPs.add(client.clientIP); // IP ebenfalls bannen
                            client.send(JSON.stringify({ type: 'chat', text: 'Vom Admin entfernt!', sender: 'SYSTEM' }));
                            client.terminate();
                        }
                    });
                    broadcastSystemMsg(`Spieler ${target} wurde entfernt.`);
                    return;
                }

                // UNBAN (Name oder IP)
                if (cmd === '/unban') {
                    bannedPlayers.delete(target);
                    bannedIPs.delete(target);
                    broadcastSystemMsg(`Spieler/IP ${target} wurde freigeschaltet.`);
                    return;
                }

                if (cmd === '/mute') {
                    mutedPlayers.add(target);
                    broadcastSystemMsg(`${target} wurde stummgeschaltet.`);
                    return;
                }

                if (cmd === '/wipe') {
                    wss.clients.forEach(c => c.terminate());
                    return;
                }
            }

            // --- MUTE CHECK ---
            if (data.type === 'chat' && mutedPlayers.has(ws.playerName)) {
                ws.send(JSON.stringify({ type: 'chat', text: 'Du bist stummgeschaltet.', sender: 'System' }));
                return;
            }

            // --- SPIEL LOGIK ---
            if (data.type === 'win') {
                const name = data.name || ws.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveLeaderboard();
                const updatedList = Object.entries(leaderboard).map(([n, w]) => ({ name: n, wins: w })).sort((a,b)=>b.wins-a.wins).slice(0,5);
                wss.clients.forEach(c => c.send(JSON.stringify({ type: 'leaderboard', list: updatedList })));
            }

            if (data.type === 'find_random') {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "random_" + Math.random();
                    waitingPlayer.send(JSON.stringify({ type: 'join', room: roomID, color: 'white', systemMsg: "Gegner gefunden!" }));
                    ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black', systemMsg: "Gegner gefunden!" }));
                    waitingPlayer.room = roomID; ws.room = roomID;
                    waitingPlayer = null;
                } else { waitingPlayer = ws; }
            }

            if (data.type === 'join' && !data.type.startsWith('find_')) {
                ws.room = data.room;
                ws.playerName = inputName;
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }

            if (data.type === 'chat' || data.type === 'move') {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === (data.room || ws.room)) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            // User-Count
            const countMsg = JSON.stringify({ type: 'user-count', count: wss.clients.size });
            wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(countMsg); });

        } catch (e) { console.error("Error:", e); }
    });

    ws.on('close', () => { if(waitingPlayer === ws) waitingPlayer = null; });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));

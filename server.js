const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => { 
    res.writeHead(200); 
    res.end("Schach-Server mit God-Mode läuft!"); 
});
const wss = new WebSocket.Server({ server });

// --- PERMANENTE SPEICHERUNG ---
const LB_FILE = './leaderboard.json';
let leaderboard = {};
let bannedPlayers = new Set(); 
let mutedPlayers = new Set(); 

const adminPass = "geheim123"; // Dein Admin-Passwort

if (fs.existsSync(LB_FILE)) {
    try { 
        leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); 
    } catch (e) { 
        leaderboard = {}; 
    }
}

function saveLeaderboard() {
    try {
        fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
    } catch (e) {
        console.error("Speicherfehler:", e);
    }
}

function broadcastSystemMsg(text) {
    const msg = JSON.stringify({ type: 'chat', text: text, sender: 'System', system: true });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

let waitingPlayer = null;

wss.on('connection', (ws) => {
    // Aktuelles Leaderboard beim Login senden
    const list = Object.entries(leaderboard).map(([name, wins]) => ({ name, wins })).sort((a,b)=>b.wins-a.wins).slice(0,5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // SICHERHEITS-CHECK: Namen am Socket merken
            if (data.playerName) ws.playerName = data.playerName;
            if (data.name) ws.playerName = data.name;

            // BAN-CHECK: Sofort kicken, wenn Name auf Blacklist
            if (ws.playerName && bannedPlayers.has(ws.playerName)) {
                ws.send(JSON.stringify({ type: 'chat', text: 'DU BIST GEBANNT!', sender: 'SYSTEM' }));
                ws.terminate();
                return;
            }

            // --- 1. ADMIN BEFEHLE ---
            if (data.type === 'chat' && data.text.startsWith('/')) {
                const parts = data.text.split(' ');
                const cmd = parts[0];
                const target = parts[1];
                const pass = data.text.includes(adminPass);

                if (pass) {
                    if (cmd === '/kick' || cmd === '/ban') {
                        if (cmd === '/ban') bannedPlayers.add(target);
                        wss.clients.forEach(client => {
                            if (client.playerName === target) {
                                client.send(JSON.stringify({ type: 'chat', text: 'Admin hat dich entfernt!', sender: 'SYSTEM' }));
                                client.terminate();
                            }
                        });
                        broadcastSystemMsg(`Spieler ${target} wurde entfernt.`);
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
            }

            // --- 2. MUTE CHECK ---
            if (data.type === 'chat' && mutedPlayers.has(ws.playerName)) {
                ws.send(JSON.stringify({ type: 'chat', text: 'Du bist stummgeschaltet.', sender: 'System' }));
                return;
            }

            // --- 3. DEINE ALTEN FUNKTIONEN (Sieg, Matchmaking, Move) ---
            if (data.type === 'win') {
                const name = data.playerName || "Anonym";
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
                } else {
                    waitingPlayer = ws;
                }
            }

            if (data.type === 'join' && !data.type.startsWith('find_')) {
                ws.room = data.room;
                ws.playerName = data.name;
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

    ws.on('close', () => {
        if(waitingPlayer === ws) waitingPlayer = null;
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server läuft auf ${PORT}`));

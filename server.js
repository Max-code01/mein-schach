const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Schach-Server läuft und ist bereit!");
});

const wss = new WebSocket.Server({ server });

// Leaderboard-Datei Setup
const LB_FILE = './leaderboard.json';
let leaderboard = {};

if (fs.existsSync(LB_FILE)) {
    try {
        const fileContent = fs.readFileSync(LB_FILE, 'utf8');
        leaderboard = JSON.parse(fileContent);
    } catch (e) {
        console.error("Fehler beim Laden des Leaderboards:", e);
        leaderboard = {};
    }
}

function saveLeaderboard() {
    try {
        fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
    } catch (e) {
        console.error("Fehler beim Speichern des Leaderboards:", e);
    }
}

let waitingPlayer = null;

wss.on('connection', (ws) => {
    // Sende Leaderboard sofort bei Verbindung
    sendLeaderboardToClient(ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // --- SIEG REGISTRIEREN ---
            if (data.type === 'win') {
                const name = data.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveLeaderboard();
                broadcastLeaderboard();
            }

            // --- MATCHMAKING (RANDOM) ---
            if (data.type === 'find_random') {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "random_" + Math.random();
                    const msg1 = JSON.stringify({ type: 'join', room: roomID, color: 'white', systemMsg: "Gegner gefunden!" });
                    const msg2 = JSON.stringify({ type: 'join', room: roomID, color: 'black', systemMsg: "Gegner gefunden!" });
                    
                    waitingPlayer.send(msg1);
                    ws.send(msg2);
                    
                    waitingPlayer.room = roomID;
                    ws.room = roomID;
                    waitingPlayer = null;
                } else {
                    waitingPlayer = ws;
                    ws.send(JSON.stringify({ type: 'system', msg: "Suche läuft..." }));
                }
            }

            // --- RAUM BEITRETEN ---
            if (data.type === 'join') {
                ws.room = data.room;
                ws.playerName = data.name;
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }

            // --- CHAT, MOVES & EMOTES WEITERLEITEN ---
            if (data.type === 'chat' || data.type === 'move' || data.type === 'emote') {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === (data.room || ws.room)) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            // --- USER COUNT ---
            const countMsg = JSON.stringify({ type: 'user-count', count: wss.clients.size });
            wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(countMsg); });

        } catch (e) {
            console.error("Fehler bei Nachricht:", e);
        }
    });

    ws.on('close', () => {
        if (waitingPlayer === ws) waitingPlayer = null;
    });
});

function broadcastLeaderboard() {
    const list = Object.entries(leaderboard)
        .map(([name, wins]) => ({ name, wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5);
    const msg = JSON.stringify({ type: 'leaderboard', list });
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

function sendLeaderboardToClient(ws) {
    const list = Object.entries(leaderboard)
        .map(([name, wins]) => ({ name, wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));

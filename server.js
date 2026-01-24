const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

// HTTP Server für Render (damit der Dienst nicht schläft)
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Schach-Server ist ONLINE!");
});

const wss = new WebSocket.Server({ server });

// --- LEADERBOARD SPEICHERUNG ---
const LB_FILE = './leaderboard.json';
let leaderboard = {};

// Daten beim Start laden
if (fs.existsSync(LB_FILE)) {
    try {
        leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8'));
        console.log("Leaderboard erfolgreich geladen.");
    } catch (e) {
        console.error("Fehler beim Laden:", e);
        leaderboard = {};
    }
}

function saveLeaderboard() {
    fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
}

let waitingPlayer = null;

wss.on('connection', (ws) => {
    console.log("Neuer Spieler verbunden.");
    
    // Aktuelles Leaderboard sofort senden
    sendLeaderboard(ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Sieg registrieren
            if (data.type === 'win') {
                const name = data.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveLeaderboard();
                broadcastLeaderboard();
            }

            // 2. Matchmaking (Zufälliger Gegner)
            if (data.type === 'find_random') {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "room_" + Math.floor(Math.random() * 100000);
                    const msg1 = { type: 'join', room: roomID, color: 'white', systemMsg: "Gegner gefunden! Du bist WEISS." };
                    const msg2 = { type: 'join', room: roomID, color: 'black', systemMsg: "Gegner gefunden! Du bist SCHWARZ." };
                    
                    waitingPlayer.send(JSON.stringify(msg1));
                    ws.send(JSON.stringify(msg2));
                    
                    waitingPlayer.room = roomID;
                    ws.room = roomID;
                    waitingPlayer = null;
                } else {
                    waitingPlayer = ws;
                }
            }

            // 3. Raum beitreten (Privat)
            if (data.type === 'join' && !data.type.includes('random')) {
                ws.room = data.room;
                ws.playerName = data.name || "Spieler";
                ws.send(JSON.stringify({ type: 'join', room: data.room, systemMsg: "Raum beigetreten." }));
            }

            // 4. Chat & Spielzüge weiterleiten
            if (data.type === 'chat' || data.type === 'move') {
                const targetRoom = data.room || ws.room;
                wss.clients.forEach(client => {
                    // Sende an alle im selben Raum außer dem Sender
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === targetRoom) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            broadcastUserCount();

        } catch (e) {
            console.error("Server-Fehler:", e);
        }
    });

    ws.on('close', () => {
        if (waitingPlayer === ws) waitingPlayer = null;
        broadcastUserCount();
    });
});

// --- HELFER ---
function broadcastLeaderboard() {
    const list = Object.entries(leaderboard)
        .map(([name, wins]) => ({ name, wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5);
    const msg = JSON.stringify({ type: 'leaderboard', list });
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

function sendLeaderboard(ws) {
    const list = Object.entries(leaderboard)
        .map(([name, wins]) => ({ name, wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));
}

function broadcastUserCount() {
    const msg = JSON.stringify({ type: 'user-count', count: wss.clients.size });
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));

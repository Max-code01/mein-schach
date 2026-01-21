const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let leaderboard = {}; // Speichert { "Name": Siege }
let rooms = {};

wss.on('connection', (ws) => {
    let currentRoom = null;
    let playerName = "WeltGast";

    // Sofort das aktuelle Leaderboard senden
    sendLeaderboard(ws);

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // --- ROOM LOGIK ---
        if (data.type === 'join') {
            currentRoom = data.room;
            playerName = data.name || "WeltGast";
            ws.join(currentRoom);
        }

        // --- WIN LOGIK (Für das Leaderboard) ---
        if (data.type === 'win') {
            const winnerName = data.playerName || playerName;
            leaderboard[winnerName] = (leaderboard[winnerName] || 0) + 1;
            broadcastLeaderboard(); // Alle informieren
        }

        // --- WEITERLEITUNG (Moves & Chat) ---
        wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                // Hier prüfen wir normalerweise den Raum, aber für den Chat/Move 
                // leiten wir es an alle relevanten Clients weiter
                client.send(JSON.stringify(data));
            }
        });

        // User Count Update
        broadcastUserCount();
    });

    ws.on('close', () => broadcastUserCount());
});

function sendLeaderboard(target) {
    const sorted = Object.entries(leaderboard)
        .map(([name, wins]) => ({ name, wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5);
    target.send(JSON.stringify({ type: 'leaderboard', list: sorted }));
}

function broadcastLeaderboard() {
    const sorted = Object.entries(leaderboard)
        .map(([name, wins]) => ({ name, wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5);
    const msg = JSON.stringify({ type: 'leaderboard', list: sorted });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

function broadcastUserCount() {
    const msg = JSON.stringify({ type: 'user-count', count: wss.clients.size });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));

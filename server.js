const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Schach-Server läuft aktiv!");
});

const wss = new WebSocket.Server({ server });

// --- LEADERBOARD & ELO SETUP ---
const LB_FILE = './leaderboard.json';
const K_FACTOR = 32;
let leaderboard = {};

if (fs.existsSync(LB_FILE)) {
    try {
        leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8'));
    } catch (e) {
        leaderboard = {};
    }
}

function saveLeaderboard() {
    fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
}

function ensureElo(name) {
    if (!leaderboard[name]) {
        leaderboard[name] = { wins: 0, elo: 1200 };
    } else if (typeof leaderboard[name] === 'number') {
        leaderboard[name] = { wins: leaderboard[name], elo: 1200 };
    }
}

let waitingPlayer = null;

wss.on('connection', (ws) => {
    // Sende Leaderboard beim Connect
    sendLeaderboard(ws);
    broadcastUserCount();

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. JOIN LOGIK (Spieler & Zuschauer)
            if (data.type === 'join') {
                ws.room = data.room;
                ws.playerName = data.name;
                ws.isSpectator = false;
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }
            
            if (data.type === 'join_spectator') {
                ws.room = data.room;
                ws.playerName = data.name;
                ws.isSpectator = true;
                ws.send(JSON.stringify({ type: 'join', room: data.room, color: 'spectator', systemMsg: "Zuschauer-Modus aktiv." }));
            }

            // 2. MATCHMAKING
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

            // 3. ELO & SIEG LOGIK
            if (data.type === 'win') {
                const winnerName = data.playerName;
                const loserName = data.loserName || "Unbekannt";
                
                ensureElo(winnerName);
                ensureElo(loserName);

                const oldWinElo = leaderboard[winnerName].elo;
                const oldLoseElo = leaderboard[loserName].elo;

                const ea = 1 / (1 + Math.pow(10, (oldLoseElo - oldWinElo) / 400));
                const winChange = Math.round(K_FACTOR * (1 - ea));
                const lossChange = Math.round(K_FACTOR * (0 - (1 - ea)));

                leaderboard[winnerName].elo += winChange;
                leaderboard[loserName].elo += lossChange;
                leaderboard[winnerName].wins++;

                saveLeaderboard();
                broadcastLeaderboard();

                // Elo-Updates an die Spieler senden
                wss.clients.forEach(client => {
                    if (client.playerName === winnerName) 
                        client.send(JSON.stringify({ type: 'elo_update', change: winChange, newElo: leaderboard[winnerName].elo }));
                    if (client.playerName === loserName) 
                        client.send(JSON.stringify({ type: 'elo_update', change: lossChange, newElo: leaderboard[loserName].elo }));
                });
            }

            // 4. WEITERLEITUNG (Chat, Moves, Remis, Resign)
            if (['chat', 'move', 'draw_offer', 'draw_accept', 'resign'].includes(data.type)) {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === (data.room || ws.room)) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

        } catch (e) { console.error(e); }
    });

    ws.on('close', () => { 
        if(waitingPlayer === ws) waitingPlayer = null; 
        broadcastUserCount();
    });
});

function broadcastLeaderboard() {
    const list = Object.entries(leaderboard)
        .map(([name, d]) => ({ name, wins: d.wins, elo: d.elo }))
        .sort((a, b) => b.elo - a.elo).slice(0, 5);
    const msg = JSON.stringify({ type: 'leaderboard', list });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

function sendLeaderboard(ws) {
    const list = Object.entries(leaderboard)
        .map(([name, d]) => ({ name, wins: d.wins, elo: d.elo }))
        .sort((a, b) => b.elo - a.elo).slice(0, 5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));
}

function broadcastUserCount() {
    const msg = JSON.stringify({ type: 'user-count', count: wss.clients.size });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT);

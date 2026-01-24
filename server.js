const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Schach-Server läuft!");
});

const wss = new WebSocket.Server({ server });
const LB_FILE = './leaderboard.json';
let leaderboard = {};

if (fs.existsSync(LB_FILE)) {
    try {
        leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8'));
    } catch (e) { leaderboard = {}; }
}

function saveLeaderboard() {
    fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
}

wss.on('connection', (ws) => {
    sendLeaderboard(ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'chat' || data.type === 'move') {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === (data.room || ws.room)) {
                        client.send(JSON.stringify(data));
                    }
                });
            }
            if (data.type === 'win') {
                leaderboard[data.playerName] = (leaderboard[data.playerName] || 0) + 1;
                saveLeaderboard();
                broadcastLeaderboard();
            }
        } catch (e) { console.error(e); }
    });
});

function broadcastLeaderboard() {
    const list = Object.entries(leaderboard).map(([name, wins]) => ({ name, wins })).sort((a,b) => b.wins - a.wins).slice(0, 5);
    const msg = JSON.stringify({ type: 'leaderboard', list });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

function sendLeaderboard(ws) {
    const list = Object.entries(leaderboard).map(([name, wins]) => ({ name, wins })).sort((a,b) => b.wins - a.wins).slice(0, 5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));
}

server.listen(process.env.PORT || 8080);

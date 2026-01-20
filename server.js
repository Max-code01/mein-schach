const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

let users = new Set();
let randomQueue = null;
let leaderboard = {}; // Speichert Siege

function broadcastUserCount() {
    const count = users.size;
    users.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'user_count', count }));
        }
    });
}

wss.on('connection', (ws) => {
    users.add(ws);
    ws.room = "global"; 
    broadcastUserCount();

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // 1. BEITRETEN (Privat oder Global)
        if (data.type === 'join') {
            ws.room = data.room || "global";
            ws.playerName = data.name || "Gast";
            console.log(`${ws.playerName} ist Raum ${ws.room} beigetreten`);
        }

        // 2. ZUFÄLLIGER GEGNER
        if (data.type === 'find_random') {
            ws.playerName = data.name || "Gast";
            if (randomQueue && randomQueue !== ws && randomQueue.readyState === WebSocket.OPEN) {
                const partner = randomQueue;
                randomQueue = null;
                const roomID = "random_" + Math.random().toString(36).substr(2, 9);
                
                ws.room = roomID;
                partner.room = roomID;
                
                ws.send(JSON.stringify({ type: 'match_found', color: 'white', room: roomID }));
                partner.send(JSON.stringify({ type: 'match_found', color: 'black', room: roomID }));
            } else {
                randomQueue = ws;
            }
        }

        // 3. WEITERLEITUNG (Züge & Chat)
        users.forEach(client => {
            if (client !== ws && client.room === ws.room && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    });

    ws.on('close', () => {
        users.delete(ws);
        if (randomQueue === ws) randomQueue = null;
        broadcastUserCount();
    });
});

console.log("Schach-Server mit allen Funktionen bereit!");

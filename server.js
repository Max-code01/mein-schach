const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

let users = new Set();
let randomQueue = null; 
let leaderboard = {};

wss.on('connection', (ws) => {
    users.add(ws);
    ws.room = "global";
    broadcastUserCount();

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'join') {
            ws.room = data.room || "global";
            ws.playerName = data.name || "Gast";
        }

        if (data.type === 'find_random') {
            ws.playerName = data.name || "Gast";
            if (randomQueue && randomQueue !== ws && randomQueue.readyState === WebSocket.OPEN) {
                const partner = randomQueue;
                randomQueue = null;
                const roomID = "match_" + Math.random().toString(36).substr(2, 9);
                ws.room = roomID;
                partner.room = roomID;
                ws.send(JSON.stringify({ type: 'match_found', color: 'black', room: roomID }));
                partner.send(JSON.stringify({ type: 'match_found', color: 'white', room: roomID }));
            } else {
                randomQueue = ws;
            }
        }

        // Broadcast Logik für Chat und Züge
        const msgString = JSON.stringify(data);
        users.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                if (data.type === 'global_chat' || (client.room === ws.room)) {
                    client.send(msgString);
                }
            }
        });
    });

    ws.on('close', () => {
        users.delete(ws);
        if (randomQueue === ws) randomQueue = null;
        broadcastUserCount();
    });
});

function broadcastUserCount() {
    const msg = JSON.stringify({ type: 'user-count', count: users.size });
    users.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

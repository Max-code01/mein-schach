const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

let users = new Set();
let randomQueue = null; 

wss.on('connection', (ws) => {
    users.add(ws);
    ws.room = "global"; 
    
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'join') {
            ws.room = data.room || "global";
            ws.playerName = data.name || "Gast";
        }

        if (data.type === 'find_random') {
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

        if (data.type === 'global_chat') {
            const msg = JSON.stringify({ type: 'global_chat', sender: data.sender, text: data.text });
            users.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(msg);
            });
        }

        if (data.type === 'move') {
            const msg = JSON.stringify({ type: 'move', move: data.move });
            users.forEach(client => {
                if (client !== ws && client.room === ws.room && client.readyState === WebSocket.OPEN) {
                    client.send(msg);
                }
            });
        }
    });

    ws.on('close', () => {
        users.delete(ws);
        if (randomQueue === ws) randomQueue = null;
    });
});
console.log("Schach-Server bereit!");

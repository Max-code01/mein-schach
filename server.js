const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

let users = new Set();

wss.on('connection', (ws) => {
    users.add(ws);
    ws.room = "global"; // Standard-Raum

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // Falls ein Spieler einem speziellen Raum beitritt
        if (data.type === 'join') {
            ws.room = data.room || "global";
        }

        // Leitet die Daten (Zug oder Chat) an alle anderen im selben Raum weiter
        users.forEach(client => {
            if (client !== ws && client.room === ws.room && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    });

    ws.on('close', () => {
        users.delete(ws);
    });
});

console.log("Schach-Server läuft auf Port " + (process.env.PORT || 8080));

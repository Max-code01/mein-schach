const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

let users = new Set();
let randomQueue = null; 
let leaderboard = {}; // Speichert Siege

wss.on('connection', (ws) => {
    users.add(ws);
    ws.room = "global"; // Standard-Raum
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
                const roomID = "match_" + Math.random().toString(36).substr(2, 9);
                
                ws.room = roomID;
                partner.room = roomID;

                ws.send(JSON.stringify({ type: 'match_found', color: 'black', room: roomID }));
                partner.send(JSON.stringify({ type: 'match_found', color: 'white', room: roomID }));
            } else {
                randomQueue = ws;
            }
        }

        // 3. PRIVATER CHAT (Nur gleicher Raum)
        if (data.type === 'chat') {
            broadcastToRoom(ws, {
                type: 'chat',
                sender: data.sender,
                text: data.text
            });
        }

        // 4. WELT-CHAT (An alle)
        if (data.type === 'global_chat') {
            const globalMsg = JSON.stringify({
                type: 'global_chat',
                sender: data.sender,
                text: data.text
            });
            users.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(globalMsg);
                }
            });
        }

        // 5. ZÜGE WEITERLEITEN
        if (data.type === 'move') {
            broadcastToRoom(ws, {
                type: 'move',
                move: data.move
            });
        }

        // 6. SIEG / AUFGABE REGISTRIEREN
        if (data.type === 'win') {
            const winner = data.winner;
            if (winner && winner !== "Gegner (durch Aufgabe)") {
                leaderboard[winner] = (leaderboard[winner] || 0) + 1;
                sendLeaderboard();
            }
        }
    });

    ws.on('close', () => {
        users.delete(ws);
        if (randomQueue === ws) randomQueue = null;
        broadcastUserCount();
    });
});

function broadcastToRoom(sender, message) {
    const msgString = JSON.stringify(message);
    users.forEach(client => {
        if (client !== sender && client.room === sender.room && client.readyState === WebSocket.OPEN) {
            client.send(msgString);
        }
    });
}

function broadcastUserCount() {
    const msg = JSON.stringify({ type: 'user-count', count: users.size });
    users.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

function sendLeaderboard() {
    const sorted = Object.entries(leaderboard)
        .map(([n, w]) => ({ n, w }))
        .sort((a, b) => b.w - a.w)
        .slice(0, 5);
    const msg = JSON.stringify({ type: 'leaderboard', data: sorted });
    users.forEach(c => c.send(msg));
}

console.log("Schach-Server mit allen Funktionen bereit!");

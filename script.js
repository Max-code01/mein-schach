const WebSocket = require('ws');
const http = require('http');
const fs = require('fs'); // Zum Speichern der Datei

const PORT = process.env.PORT || 8080;
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Dateipfad für die Speicherung
const DB_FILE = './leaderboard.json';

// Lade die Bestenliste beim Start aus der Datei
let leaderboardData = {};
if (fs.existsSync(DB_FILE)) {
    try {
        leaderboardData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log("Bestenliste geladen.");
    } catch (e) {
        console.error("Fehler beim Laden der Bestenliste:", e);
        leaderboardData = {};
    }
}

let players = {}; 
let rooms = {};   
let waitingPlayer = null; 

wss.on('connection', (ws) => {
    ws.id = Math.random().toString(36).substring(7);
    players[ws.id] = { name: "Gast", ws: ws, room: null };

    // Sende sofort den aktuellen Stand beim Verbinden
    sendLeaderboardUpdate();

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'join':
                handleJoin(ws, data);
                break;
            
            case 'find_random':
                handleRandomSearch(ws, data);
                break;

            case 'move':
                if (rooms[data.room]) {
                    broadcastToRoom(data.room, { type: 'move', move: data.move }, ws);
                }
                break;

            case 'chat':
                broadcastToRoom(data.room, {
                    type: 'chat',
                    sender: data.sender || "Gast",
                    text: data.text
                }, ws);
                break;

            case 'win':
                // PERMANENTES SPEICHERN DER SIEGE
                const winnerName = data.playerName || "Unbekannter Held";
                if (!leaderboardData[winnerName]) {
                    leaderboardData[winnerName] = { wins: 0 };
                }
                leaderboardData[winnerName].wins += 1;
                
                // In Datei schreiben
                fs.writeFileSync(DB_FILE, JSON.stringify(leaderboardData, null, 2));
                console.log(`Sieg für ${winnerName} gespeichert.`);
                
                sendLeaderboardUpdate();
                break;
        }
        
        // Sende User-Anzahl an alle
        broadcastToAll({ type: 'user-count', count: wss.clients.size });
    });

    ws.on('close', () => {
        if (waitingPlayer === ws) waitingPlayer = null;
        delete players[ws.id];
        broadcastToAll({ type: 'user-count', count: wss.clients.size });
    });
});

function handleJoin(ws, data) {
    const roomID = data.room;
    players[ws.id].name = data.name || "Gast";
    
    if (!rooms[roomID]) {
        rooms[roomID] = { white: ws, black: null };
        ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'white' }));
    } else if (!rooms[roomID].black) {
        rooms[roomID].black = ws;
        ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black' }));
    } else {
        ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'spectator' }));
    }
}

function handleRandomSearch(ws, data) {
    if (waitingPlayer && waitingPlayer !== ws) {
        const roomID = "room_" + Math.random().toString(36).substring(7);
        rooms[roomID] = { white: waitingPlayer, black: ws };
        waitingPlayer.send(JSON.stringify({ type: 'join', room: roomID, color: 'white' }));
        ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black' }));
        waitingPlayer = null;
    } else {
        waitingPlayer = ws;
    }
}

function broadcastToRoom(roomID, message, senderWs) {
    const room = rooms[roomID];
    if (room) {
        [room.white, room.black].forEach(client => {
            if (client && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }
}

function broadcastToAll(message) {
    const msgString = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msgString);
        }
    });
}

function sendLeaderboardUpdate() {
    // Wandle Objekt in sortiertes Array um
    const list = Object.keys(leaderboardData).map(name => ({
        name: name,
        wins: leaderboardData[name].wins
    })).sort((a, b) => b.wins - a.wins).slice(0, 10);

    broadcastToAll({ type: 'leaderboard', list: list });
}

server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT} - Speicherung aktiv.`);
});

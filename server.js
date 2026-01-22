const WebSocket = require('ws');
const http = require('http');

// Port-Konfiguration für Deployment (z.B. Render) oder lokal
const PORT = process.env.PORT || 8080;
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Daten-Speicher (Im echten Betrieb wäre eine Datenbank besser, hier im RAM)
let players = {}; // Speichert Name, Elo, Wins pro Verbindung
let rooms = {};   // Speichert Spielzustände pro Raum
let waitingPlayer = null; // Für die Zufallssuche

// Standard-Elo-Wert
const DEFAULT_ELO = 1000;

wss.on('connection', (ws) => {
    // Initialisiere Spieler-Daten für diese Verbindung
    ws.id = Math.random().toString(36).substring(7);
    players[ws.id] = { 
        name: "Gast", 
        elo: DEFAULT_ELO, 
        wins: 0, 
        ws: ws, 
        room: null 
    };

    console.log(`Neuer Spieler verbunden: ${ws.id}`);

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
                handleMove(ws, data);
                break;

            case 'chat':
                broadcastToRoom(data.room, {
                    type: 'chat',
                    sender: data.sender,
                    text: data.text
                }, ws);
                break;

            case 'win':
                handleWin(ws, data);
                break;

            case 'resign':
                handleResign(ws, data);
                break;

            case 'draw_offer':
                broadcastToRoom(data.room, { type: 'chat', sender: 'System', text: 'Gegner bietet Remis an.' }, ws);
                break;
        }

        // Sende bei jeder Aktion das aktuelle Leaderboard und User-Count
        updateGlobalStats();
    });

    ws.on('close', () => {
        if (waitingPlayer === ws) waitingPlayer = null;
        delete players[ws.id];
        updateGlobalStats();
        console.log(`Spieler getrennt: ${ws.id}`);
    });
});

// FUNKTIONEN

function handleJoin(ws, data) {
    const roomID = data.room;
    ws.playerName = data.name || "Gast";
    players[ws.id].name = ws.playerName;
    players[ws.id].room = roomID;

    if (!rooms[roomID]) {
        rooms[roomID] = { white: ws, black: null };
        ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'white' }));
    } else if (!rooms[roomID].black) {
        rooms[roomID].black = ws;
        ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black' }));
        // Benachrichtige Weiß, dass Schwarz da ist
        rooms[roomID].white.send(JSON.stringify({ type: 'chat', sender: 'System', text: 'Gegner ist beigetreten!' }));
    } else {
        // Zuschauer-Modus
        ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'spectator' }));
    }
}

function handleRandomSearch(ws, data) {
    ws.playerName = data.name || "Gast";
    players[ws.id].name = ws.playerName;

    if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
        const roomID = "random_" + Math.random().toString(36).substring(7);
        rooms[roomID] = { white: waitingPlayer, black: ws };
        
        waitingPlayer.send(JSON.stringify({ type: 'join', room: roomID, color: 'white' }));
        ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black' }));
        
        waitingPlayer = null;
    } else {
        waitingPlayer = ws;
        ws.send(JSON.stringify({ type: 'chat', sender: 'System', text: 'Suche läuft... Warte auf Gegner.' }));
    }
}

function handleMove(ws, data) {
    broadcastToRoom(data.room, {
        type: 'move',
        move: data.move
    }, ws);
}

function handleWin(ws, data) {
    const p = players[ws.id];
    p.wins += 1;
    const eloGain = 25;
    p.elo += eloGain;

    ws.send(JSON.stringify({ 
        type: 'elo_update', 
        change: eloGain, 
        newElo: p.elo 
    }));
    updateGlobalStats();
}

function handleResign(ws, data) {
    broadcastToRoom(data.room, { 
        type: 'chat', 
        sender: 'System', 
        text: 'Gegner hat aufgegeben!' 
    }, ws);
}

function broadcastToRoom(roomID, message, senderWs) {
    if (rooms[roomID]) {
        Object.values(rooms[roomID]).forEach(client => {
            if (client && client !== senderWs && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }
}

function updateGlobalStats() {
    const allPlayers = Object.values(players);
    const leaderboard = allPlayers
        .map(p => ({ name: p.name, elo: p.elo, wins: p.wins }))
        .sort((a, b) => b.elo - a.elo)
        .slice(0, 10);

    const statsUpdate = JSON.stringify({
        type: 'leaderboard',
        list: leaderboard,
        count: allPlayers.length
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(statsUpdate);
            client.send(JSON.stringify({ type: 'user-count', count: allPlayers.length }));
        }
    });
}

server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});

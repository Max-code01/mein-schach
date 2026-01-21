const WebSocket = require('ws');
const http = require('http');

// Einfacher HTTP-Server, damit Render den Dienst als aktiv erkennt
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Schach-Server läuft!");
});

const wss = new WebSocket.Server({ server });

let leaderboard = {}; 
let waitingPlayer = null; // Warteschlange für "Zufälliger Gegner"

wss.on('connection', (ws) => {
    console.log("Neuer Spieler verbunden");
    
    // Initial-Daten senden
    sendLeaderboard(ws);
    broadcastUserCount();

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // --- 1. MATCHMAKING (Zufälliger Gegner) ---
        if (data.type === 'find_random') {
            // Prüfen, ob bereits jemand wartet und noch verbunden ist
            if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                const roomID = "random_" + Math.floor(Math.random() * 100000);
                
                const matchMsg = JSON.stringify({ 
                    type: 'join', 
                    room: roomID, 
                    systemMsg: "Gegner gefunden! Spiel startet... ⚔️" 
                });
                
                // Beide Spieler in den neuen Raum schicken
                ws.send(matchMsg);
                waitingPlayer.send(matchMsg);
                
                console.log(`Match erstellt: Raum ${roomID}`);
                waitingPlayer = null; 
            } else {
                // Spieler auf die Warteliste setzen
                waitingPlayer = ws;
                ws.send(JSON.stringify({ type: 'chat', sender: 'System', text: 'Warten auf Gegner... ⏳' }));
            }
        }

        // --- 2. JOIN RAUM ---
        if (data.type === 'join' && data.room) {
            ws.room = data.room;
            ws.playerName = data.name || "WeltGast";
            console.log(`${ws.playerName} ist Raum ${ws.room} beigetreten`);
        }

        // --- 3. CHAT & MOVES WEITERLEITEN ---
        if (data.type === 'chat' || data.type === 'move') {
            const msg = JSON.stringify(data);
            wss.clients.forEach(client => {
                // Nachricht an alle im gleichen Raum senden (außer an den Absender selbst)
                if (client !== ws && client.readyState === WebSocket.OPEN && client.room === ws.room) {
                    client.send(msg);
                }
            });
        }

        // --- 4. SIEG & LEADERBOARD ---
        if (data.type === 'win') {
            const name = data.playerName || "Unbekannt";
            leaderboard[name] = (leaderboard[name] || 0) + 1;
            
            // Allen Spielern (global) mitteilen und Leaderboard updaten
            broadcastToAll({ type: 'win', playerName: name });
            broadcastLeaderboard();
        }
    });

    ws.on('close', () => {
        if (waitingPlayer === ws) {
            waitingPlayer = null;
        }
        broadcastUserCount();
        console.log("Verbindung geschlossen");
    });
});

// --- HILFSFUNKTIONEN ---

function broadcastToAll(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

function broadcastUserCount() {
    broadcastToAll({ type: 'user-count', count: wss.clients.size });
}

function sendLeaderboard(ws) {
    const list = Object.entries(leaderboard)
        .map(([name, wins]) => ({ name, wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));
}

function broadcastLeaderboard() {
    const list = Object.entries(leaderboard)
        .map(([name, wins]) => ({ name, wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5);
    broadcastToAll({ type: 'leaderboard', list });
}

// Port für Render.com
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});

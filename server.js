const WebSocket = require('ws');
const http = require('http');

// Erstellt einen einfachen HTTP-Server, damit Render den Port binden kann
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Schach-Server läuft!");
});

const wss = new WebSocket.Server({ server });

let leaderboard = {}; // Speichert { "Name": Siege }

wss.on('connection', (ws) => {
    console.log("Ein Spieler hat sich verbunden.");

    // 1. Sofort das aktuelle Leaderboard an den neuen Spieler senden
    sendLeaderboardTo(ws);
    // 2. Spieler-Zähler an alle senden
    broadcastUserCount();

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // --- WIN LOGIK ---
            if (data.type === 'win') {
                const name = data.playerName || "WeltGast";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                console.log(`Sieg für ${name}! Neuer Stand: ${leaderboard[name]}`);
                broadcastLeaderboard(); // Alle Spieler über neues Ranking informieren
            }

            // --- WEITERLEITUNG (Züge, Chat, Join) ---
            // Schickt die Nachricht an alle ANDEREN verbundenen Spieler
            wss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });

        } catch (e) {
            console.error("Fehler beim Verarbeiten der Nachricht:", e);
        }
    });

    ws.on('close', () => {
        console.log("Ein Spieler hat die Verbindung getrennt.");
        broadcastUserCount();
    });
});

// Funktion: Schickt das Leaderboard nur an einen bestimmten Spieler
function sendLeaderboardTo(client) {
    const sorted = Object.entries(leaderboard)
        .map(([name, wins]) => ({ name, wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5); // Top 5
    
    client.send(JSON.stringify({ type: 'leaderboard', list: sorted }));
}

// Funktion: Schickt das Leaderboard an ALLE Spieler
function broadcastLeaderboard() {
    const sorted = Object.entries(leaderboard)
        .map(([name, wins]) => ({ name, wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5);
    
    const msg = JSON.stringify({ type: 'leaderboard', list: sorted });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// Funktion: Schickt die aktuelle Spieleranzahl an alle
function broadcastUserCount() {
    const msg = JSON.stringify({ type: 'user-count', count: wss.clients.size });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// Port-Einstellung für Render.com
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});

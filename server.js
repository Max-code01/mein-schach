const WebSocket = require('ws');
const http = require('http');

// Einfacher HTTP-Server für Render (Keep-Alive)
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Schach-Server Status: Aktiv und Bereit ⚔️");
});

const wss = new WebSocket.Server({ server });

let leaderboard = {}; 
let waitingPlayer = null; // Warteschlange für "Zufälliger Gegner"

wss.on('connection', (ws) => {
    console.log("Neuer Spieler verbunden");
    
    // Initialer Sync beim Verbinden
    sendLeaderboard(ws);
    broadcastUserCount();

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // --- 1. MATCHMAKING (Zufälliger Gegner) ---
            if (data.type === 'find_random') {
                // Falls bereits jemand wartet und noch online ist
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "random_" + Math.floor(Math.random() * 100000);
                    
                    // Spieler 1 (der Wartende) bekommt Weiß
                    waitingPlayer.send(JSON.stringify({ 
                        type: 'join', 
                        room: roomID, 
                        color: 'white', 
                        systemMsg: "Gegner gefunden! Du bist WEISS. Dein Zug! ⚔️" 
                    }));
                    waitingPlayer.room = roomID;

                    // Spieler 2 (der gerade Anfragende) bekommt Schwarz
                    ws.send(JSON.stringify({ 
                        type: 'join', 
                        room: roomID, 
                        color: 'black', 
                        systemMsg: "Gegner gefunden! Du bist SCHWARZ. Viel Glück! 🛡️" 
                    }));
                    ws.room = roomID;
                    
                    console.log(`Match erstellt: ${roomID}`);
                    waitingPlayer = null; 
                } else {
                    // Spieler in die Warteschlange setzen
                    waitingPlayer = ws;
                    ws.send(JSON.stringify({ type: 'chat', sender: 'System', text: 'Suche Gegner... Bitte warten... ⏳' }));
                }
            }

            // --- 2. JOIN RAUM (Manueller Beitritt) ---
            if (data.type === 'join' && !data.type.startsWith('find_')) {
                ws.room = data.room;
                ws.playerName = data.name || "Gast";
                console.log(`${ws.playerName} ist Raum ${ws.room} beigetreten`);
                
                // Bestätigung an den Spieler senden
                ws.send(JSON.stringify({ 
                    type: 'join', 
                    room: data.room, 
                    systemMsg: `Erfolgreich mit Raum ${data.room} verbunden.` 
                }));
            }

            // --- 3. CHAT & MOVES WEITERLEITEN ---
            if (data.type === 'chat' || data.type === 'move') {
                const msg = JSON.stringify(data);
                wss.clients.forEach(client => {
                    // Sende Nachricht NUR an Leute im selben Raum (außer an sich selbst)
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === (data.room || ws.room)) {
                        client.send(msg);
                    }
                });
            }

            // --- 4. SIEG-SYSTEM ---
            if (data.type === 'win') {
                const name = data.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                
                // Global verkünden
                broadcastToAll({ 
                    type: 'chat', 
                    sender: '🏆 SYSTEM', 
                    text: `${name} hat ein Spiel gewonnen und steigt im Leaderboard!` 
                });
                broadcastLeaderboard();
            }

        } catch (err) {
            console.error("Fehler beim Verarbeiten der Nachricht:", err);
        }
    });

    ws.on('close', () => {
        // Falls der wartende Spieler die Seite schließt, Warteschlange leeren
        if (waitingPlayer === ws) {
            waitingPlayer = null;
        }
        broadcastUserCount();
        console.log("Verbindung beendet");
    });
});

// --- HELFER-FUNKTIONEN ---

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

// Startet den Server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server läuft stabil auf Port ${PORT}`);
});

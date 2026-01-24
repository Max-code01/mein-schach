const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Schach-Server läuft!");
});

const wss = new WebSocket.Server({ server });

// --- PERMANENTE SPEICHERUNG SETUP ---
const LB_FILE = './leaderboard.json';
let leaderboard = {};

if (fs.existsSync(LB_FILE)) {
    try {
        const data = fs.readFileSync(LB_FILE, 'utf8');
        leaderboard = JSON.parse(data);
        console.log("Leaderboard geladen.");
    } catch (e) {
        console.error("Fehler beim Laden des Leaderboards:", e);
        leaderboard = {};
    }
}

function saveLeaderboard() {
    try {
        fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
    } catch (e) {
        console.error("Fehler beim Speichern:", e);
    }
}

let waitingPlayer = null;

// HILFSFUNKTION FÜR SYSTEM-NACHRICHTEN
function broadcastSystemMsg(text) {
    const msg = JSON.stringify({ type: 'chat', text: text, sender: 'System', system: true });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

wss.on('connection', (ws) => {
    sendLeaderboard(ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. SIEG SPEICHERN
            if (data.type === 'win') {
                const name = data.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveLeaderboard();
                broadcastLeaderboard();
            }

            // 2. MATCHMAKING
            if (data.type === 'find_random') {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "random_" + Math.random();
                    waitingPlayer.send(JSON.stringify({ type: 'join', room: roomID, color: 'white', systemMsg: "Gegner gefunden! Du bist WEISS." }));
                    ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black', systemMsg: "Gegner gefunden! Du bist SCHWARZ." }));
                    waitingPlayer.room = roomID; ws.room = roomID;
                    waitingPlayer = null;
                } else {
                    waitingPlayer = ws;
                }
            }

            // 3. JOIN LOGIK (Wichtig: Name am Socket speichern!)
            if (data.type === 'join' && !data.type.startsWith('find_')) {
                ws.room = data.room;
                ws.playerName = data.name; // Hier speichern wir den Namen für den Kick-Befehl
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }

            // 4. CHAT MIT ADMIN-BEFEHLEN
            if (data.type === 'chat') {
                const adminPass = "geheim123"; // DEIN PASSWORT

                if (data.text.startsWith('/kick ')) {
                    const parts = data.text.split(' ');
                    const target = parts[1];
                    const pass = parts[2];

                    if (pass === adminPass) {
                        wss.clients.forEach(client => {
                            if (client.playerName === target) {
                                client.send(JSON.stringify({ type: 'chat', text: 'Du wurdest gekickt!', sender: 'SYSTEM' }));
                                client.terminate(); // Kick!
                            }
                        });
                        broadcastSystemMsg(`Spieler ${target} wurde entfernt.`);
                        return; // Nachricht nicht normal weiterleiten
                    }
                } 
                
                if (data.text.startsWith('/clear ') && data.text.includes(adminPass)) {
                    // Chat leeren (einfach viele Leerzeichen an alle senden)
                    wss.clients.forEach(c => c.send(JSON.stringify({ type: 'chat', text: '<br>'.repeat(50) + 'Chat wurde geleert.', sender: 'SYSTEM' })));
                    return;
                }

                // Normaler Chat-Broadcast
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === (data.room || ws.room)) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            // 5. ZÜGE WEITERLEITEN
            if (data.type === 'move') {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === (data.room || ws.room)) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            broadcastUserCount();

        } catch (e) { console.error("Server Error:", e); }
    });

    ws.on('close', () => {
        if(waitingPlayer === ws) waitingPlayer = null;
        broadcastUserCount();
    });
});

function broadcastLeaderboard() {
    const list = Object.entries(leaderboard)
        .map(([name, wins]) => ({ name, wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5);
    const msg = JSON.stringify({ type: 'leaderboard', list });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

function sendLeaderboard(ws) {
    const list = Object.entries(leaderboard)
        .map(([name, wins]) => ({ name, wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));
}

function broadcastUserCount() {
    const msg = JSON.stringify({ type: 'user-count', count: wss.clients.size });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));

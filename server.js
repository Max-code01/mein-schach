const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => { res.writeHead(200); res.end("Schach-Server läuft!"); });
const wss = new WebSocket.Server({ server });

const LB_FILE = './leaderboard.json';
let leaderboard = {};
let bannedPlayers = new Set(); // Hier speichern wir die Gebannten (bis zum Neustart)

// Admin Passwort
const adminPass = "geheim123";

// Laden beim Start
if (fs.existsSync(LB_FILE)) {
    try {
        leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8'));
    } catch (e) { leaderboard = {}; }
}

function saveLeaderboard() {
    fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
}

function broadcastSystemMsg(text) {
    const msg = JSON.stringify({ type: 'chat', text: text, sender: 'System', system: true });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

wss.on('connection', (ws) => {
    // Leaderboard senden
    const list = Object.entries(leaderboard).map(([name, wins]) => ({ name, wins })).sort((a,b)=>b.wins-a.wins).slice(0,5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // BAN-CHECK: Wenn der Name auf der Blacklist steht, sofort kicken
            if (data.type === 'join' && bannedPlayers.has(data.name)) {
                ws.send(JSON.stringify({ type: 'chat', text: 'DU BIST GEBANNT!', sender: 'SYSTEM' }));
                ws.terminate();
                return;
            }

            // JOIN LOGIK
            if (data.type === 'join' && !data.type.startsWith('find_')) {
                ws.room = data.room;
                ws.playerName = data.name; // SEHR WICHTIG FÜR KICK
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }

            // ADMIN BEFEHLE
            if (data.type === 'chat') {
                // 1. KICK (Wirft raus)
                if (data.text.startsWith('/kick ')) {
                    const target = data.text.split(' ')[1];
                    const pass = data.text.split(' ')[2];
                    if (pass === adminPass) {
                        wss.clients.forEach(client => {
                            if (client.playerName === target) client.terminate();
                        });
                        broadcastSystemMsg(`Spieler ${target} wurde entfernt.`);
                        return;
                    }
                }

                // 2. BAN (Wirft raus und blockiert den Namen)
                if (data.text.startsWith('/ban ')) {
                    const target = data.text.split(' ')[1];
                    const pass = data.text.split(' ')[2];
                    if (pass === adminPass) {
                        bannedPlayers.add(target);
                        wss.clients.forEach(client => {
                            if (client.playerName === target) client.terminate();
                        });
                        broadcastSystemMsg(`Spieler ${target} wurde PERMANENT GEBANNT.`);
                        return;
                    }
                }

                // 3. RESET LEADERBOARD (Löscht alle Siege)
                if (data.text === `/resetall ${adminPass}`) {
                    leaderboard = {};
                    saveLeaderboard();
                    const msg = JSON.stringify({ type: 'leaderboard', list: [] });
                    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
                    broadcastSystemMsg(`Das Leaderboard wurde vom Admin gelöscht!`);
                    return;
                }
                
                // 4. CLEAR CHAT
                if (data.text === `/clear ${adminPass}`) {
                    const msg = JSON.stringify({ type: 'chat', text: '<br>'.repeat(60) + '--- Chat geleert ---', sender: 'SYSTEM' });
                    wss.clients.forEach(c => c.send(msg));
                    return;
                }
            }

            // NORMALER WEITERLEITUNGS-CODE (Move, Win, Chat)
            if (data.type === 'win') {
                const name = data.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveLeaderboard();
                const list = Object.entries(leaderboard).map(([n, w]) => ({ name: n, wins: w })).sort((a,b)=>b.wins-a.wins).slice(0,5);
                wss.clients.forEach(c => c.send(JSON.stringify({ type: 'leaderboard', list })));
            }

            if (data.type === 'chat' || data.type === 'move') {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === (data.room || ws.room)) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

        } catch (e) { console.error(e); }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server läuft!`));

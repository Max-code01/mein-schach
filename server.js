const WebSocket = require('ws');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

// --- SERVER SETUP ---
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Schach-Server mit Supabase-Datenbank läuft!");
});
const wss = new WebSocket.Server({ server });

// --- SUPABASE SETUP ---
// Die Werte kommen sicher aus den Render-Umgebungsvariablen
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

let waitingPlayer = null;

wss.on('connection', async (ws) => {
    // Beim Verbinden sofort das aktuelle Leaderboard schicken
    await sendLeaderboard(ws);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // --- 1. SIEG SPEICHERN ---
            if (data.type === 'win') {
                const name = data.playerName || "Anonym";
                
                // Prüfen, ob der Spieler bereits in der DB existiert
                const { data: userEntry } = await supabase
                    .from('leaderboard')
                    .select('wins')
                    .eq('name', name)
                    .single();

                if (userEntry) {
                    // Update: Bestehende Siege um 1 erhöhen
                    await supabase
                        .from('leaderboard')
                        .update({ wins: userEntry.wins + 1 })
                        .eq('name', name);
                } else {
                    // Insert: Neuen Spieler mit 1 Sieg anlegen
                    await supabase
                        .from('leaderboard')
                        .insert([{ name: name, wins: 1 }]);
                }
                // Alle Clients über das neue Leaderboard informieren
                await broadcastLeaderboard();
            }

            // --- 2. MATCHMAKING ---
            if (data.type === 'find_random') {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "random_" + Math.random();
                    waitingPlayer.send(JSON.stringify({ type: 'join', room: roomID, color: 'white', systemMsg: "Gegner gefunden!" }));
                    ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black', systemMsg: "Gegner gefunden!" }));
                    waitingPlayer.room = roomID; 
                    ws.room = roomID;
                    waitingPlayer = null;
                } else {
                    waitingPlayer = ws;
                }
            }

            // --- 3. KOMMUNIKATION (Moves & Chat) ---
            if (data.type === 'join') {
                ws.room = data.room;
                ws.playerName = data.name;
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }

            if (data.type === 'chat' || data.type === 'move') {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === (data.room || ws.room)) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            broadcastUserCount();
        } catch (e) {
            console.error("Server-Fehler:", e);
        }
    });

    ws.on('close', () => {
        if(waitingPlayer === ws) waitingPlayer = null;
        broadcastUserCount();
    });
});

// --- HILFSFUNKTIONEN FÜR DIE DATENBANK ---

async function broadcastLeaderboard() {
    // Top 5 Spieler aus Supabase abrufen
    const { data: list } = await supabase
        .from('leaderboard')
        .select('name, wins')
        .order('wins', { ascending: false })
        .limit(5);

    if (list) {
        const msg = JSON.stringify({ type: 'leaderboard', list });
        wss.clients.forEach(c => {
            if(c.readyState === WebSocket.OPEN) c.send(msg);
        });
    }
}

async function sendLeaderboard(ws) {
    const { data: list } = await supabase
        .from('leaderboard')
        .select('name, wins')
        .order('wins', { ascending: false })
        .limit(5);
    
    if (list) {
        ws.send(JSON.stringify({ type: 'leaderboard', list }));
    }
}

function broadcastUserCount() {
    const msg = JSON.stringify({ type: 'user-count', count: wss.clients.size });
    wss.clients.forEach(c => {
        if(c.readyState === WebSocket.OPEN) c.send(msg);
    });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));

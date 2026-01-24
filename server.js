const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => { 
    res.writeHead(200); 
    res.end("Schach-Server FIX: Matching & Admin aktiv!"); 
});
const wss = new WebSocket.Server({ server });

const LB_FILE = './leaderboard.json';
const USER_FILE = './userDB.json';
const BAN_FILE = './bannedIPs.json';

let leaderboard = {}, userDB = {}, bannedPlayers = new Set(), bannedIPs = new Set(), mutedPlayers = new Set(); 
const adminPass = "geheim123";

// Laden beim Start
if (fs.existsSync(LB_FILE)) try { leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); } catch (e) {}
if (fs.existsSync(USER_FILE)) try { userDB = JSON.parse(fs.readFileSync(USER_FILE, 'utf8')); } catch (e) {}
if (fs.existsSync(BAN_FILE)) try { bannedIPs = new Set(JSON.parse(fs.readFileSync(BAN_FILE, 'utf8'))); } catch (e) {}

function saveAll() {
    try {
        fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
        fs.writeFileSync(USER_FILE, JSON.stringify(userDB, null, 2));
        fs.writeFileSync(BAN_FILE, JSON.stringify([...bannedIPs], null, 2));
    } catch (e) {}
}

function broadcast(msgObj) {
    const msg = JSON.stringify(msgObj);
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

let waitingPlayer = null;

wss.on('connection', (ws, req) => {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    ws.clientIP = clientIP;

    if (bannedIPs.has(ws.clientIP)) {
        ws.terminate();
        return;
    }

    // Leaderboard schicken
    const list = Object.entries(leaderboard).map(([name, wins]) => ({ name, wins })).sort((a,b)=>b.wins-a.wins).slice(0,5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const inputName = (data.name || data.playerName || data.sender || "").trim();
            const inputPass = data.password || "";

            if (inputName) ws.playerName = inputName;

            // --- ADMIN LOGIK ---
            if (data.type === 'chat' && data.text.startsWith('/') && data.text.includes(adminPass)) {
                const parts = data.text.split(' ');
                const cmd = parts[0].toLowerCase();
                const target = parts[1];

                if (cmd === '/kick' || cmd === '/ban') {
                    if (cmd === '/ban') bannedPlayers.add(target);
                    wss.clients.forEach(c => {
                        if (c.playerName === target) {
                            if (cmd === '/ban') bannedIPs.add(c.clientIP);
                            c.terminate();
                        }
                    });
                    saveAll();
                    broadcast({ type: 'chat', text: `Spieler ${target} entfernt.`, sender: 'SYSTEM', system: true });
                    return;
                }
                if (cmd === '/unban') {
                    bannedPlayers.delete(target); bannedIPs.delete(target);
                    saveAll(); return;
                }
                // ... (andere Admin-Befehle wie /mute etc. können hier bleiben)
            }

            // --- RANDOM MATCHING FIX ---
            if (data.type === 'find_random') {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "random_" + Math.random();
                    // Beide Spieler in den Raum schicken
                    const msgW = JSON.stringify({ type: 'join', room: roomID, color: 'white', systemMsg: "Gegner gefunden! Du bist Weiß." });
                    const msgB = JSON.stringify({ type: 'join', room: roomID, color: 'black', systemMsg: "Gegner gefunden! Du bist Schwarz." });
                    
                    waitingPlayer.room = roomID;
                    ws.room = roomID;
                    
                    waitingPlayer.send(msgW);
                    ws.send(msgB);
                    
                    waitingPlayer = null; // Warteschlange leeren
                } else {
                    waitingPlayer = ws; // Erster Spieler wartet
                }
                return;
            }

            // --- NORMALER JOIN (Privater Raum) ---
            if (data.type === 'join' && !data.type.startsWith('find_')) {
                ws.room = data.room;
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
                return;
            }

            // --- CHAT & MOVE WEITERLEITUNG ---
            if (data.type === 'chat' || data.type === 'move') {
                wss.clients.forEach(client => {
                    // Sende nur an Leute im GLEICHEN Raum
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === (data.room || ws.room)) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            // Sieg-Logik
            if (data.type === 'win') {
                const name = data.name || ws.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveAll();
                const updatedList = Object.entries(leaderboard).map(([n, w]) => ({ name: n, wins: w })).sort((a,b)=>b.wins-a.wins).slice(0,5);
                broadcast({ type: 'leaderboard', list: updatedList });
            }

            broadcast({ type: 'user-count', count: wss.clients.size });

        } catch (e) {}
    });

    ws.on('close', () => { if(waitingPlayer === ws) waitingPlayer = null; });
});

server.listen(process.env.PORT || 8080);

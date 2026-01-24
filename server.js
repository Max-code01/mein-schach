const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => { 
    res.writeHead(200); 
    res.end("Schach-Server mit echtem IP-Schutz läuft!"); 
});
const wss = new WebSocket.Server({ server });

// --- SPEICHERUNG ---
const LB_FILE = './leaderboard.json';
const USER_FILE = './userDB.json';
const BAN_FILE = './bannedIPs.json'; // NEU: Damit IP-Banns Neustarts überleben

let leaderboard = {};
let userDB = {}; 
let bannedPlayers = new Set(); 
let bannedIPs = new Set(); 
let mutedPlayers = new Set(); 

const adminPass = "geheim123";

// Laden der Dateien
if (fs.existsSync(LB_FILE)) try { leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); } catch (e) {}
if (fs.existsSync(USER_FILE)) try { userDB = JSON.parse(fs.readFileSync(USER_FILE, 'utf8')); } catch (e) {}
if (fs.existsSync(BAN_FILE)) {
    try { 
        const savedIPs = JSON.parse(fs.readFileSync(BAN_FILE, 'utf8'));
        bannedIPs = new Set(savedIPs);
    } catch (e) {}
}

function saveAll() {
    fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
    fs.writeFileSync(USER_FILE, JSON.stringify(userDB, null, 2));
    fs.writeFileSync(BAN_FILE, JSON.stringify([...bannedIPs], null, 2)); // IPs speichern
}

function broadcastSystemMsg(text) {
    const msg = JSON.stringify({ type: 'chat', text: text, sender: 'System', system: true });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

let waitingPlayer = null;

wss.on('connection', (ws, req) => {
    // 1. IP SOFORT ERMITTELN
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    ws.clientIP = clientIP;

    // 2. IP-CHECK (WICHTIGSTE STELLE)
    if (bannedIPs.has(ws.clientIP)) {
        console.log("Gebannte IP versucht zu verbinden:", ws.clientIP);
        ws.send(JSON.stringify({ type: 'chat', text: 'DEINE IP IST GEBANNT!', sender: 'SYSTEM', system: true }));
        ws.terminate(); // Verbindung sofort trennen
        return;
    }

    const list = Object.entries(leaderboard).map(([name, wins]) => ({ name, wins })).sort((a,b)=>b.wins-a.wins).slice(0,5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const inputName = (data.name || data.playerName || data.sender || "").trim();
            const inputPass = data.password || "";

            if (inputName) ws.playerName = inputName;

            // Nickname-Schutz
            if (data.type === 'join' || data.type === 'find_random') {
                if (inputName) {
                    if (!userDB[inputName]) {
                        userDB[inputName] = inputPass;
                        saveAll();
                    } else if (userDB[inputName] !== inputPass) {
                        ws.send(JSON.stringify({ type: 'chat', text: 'NICK GESCHÜTZT!', sender: 'System', system: true }));
                        ws.terminate();
                        return;
                    }
                }
            }

            // Admin Befehle
            if (data.type === 'chat' && data.text.startsWith('/') && data.text.includes(adminPass)) {
                const parts = data.text.split(' ');
                const cmd = parts[0].toLowerCase();
                const target = parts[1];

                if (cmd === '/ban') {
                    bannedPlayers.add(target);
                    wss.clients.forEach(client => {
                        if (client.playerName === target) {
                            bannedIPs.add(client.clientIP); // IP des Ziels speichern
                            client.send(JSON.stringify({ type: 'chat', text: 'IP-BAN!', sender: 'SYSTEM' }));
                            client.terminate();
                        }
                    });
                    saveAll();
                    broadcastSystemMsg(`Spieler ${target} und seine IP wurden gebannt.`);
                    return;
                }

                if (cmd === '/unban') {
                    bannedPlayers.delete(target);
                    bannedIPs.delete(target);
                    saveAll();
                    broadcastSystemMsg(`${target} wurde entbannt.`);
                    return;
                }
            }

            // Normaler Spiel-Ablauf (Deine Logik)
            if (data.type === 'win') {
                const name = data.name || ws.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveAll();
                const updatedList = Object.entries(leaderboard).map(([n, w]) => ({ name: n, wins: w })).sort((a,b)=>b.wins-a.wins).slice(0,5);
                wss.clients.forEach(c => c.send(JSON.stringify({ type: 'leaderboard', list: updatedList })));
            }

            if (data.type === 'find_random' || data.type === 'join' || data.type === 'chat' || data.type === 'move') {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === (data.room || ws.room)) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

        } catch (e) {}
    });
});

server.listen(process.env.PORT || 8080);

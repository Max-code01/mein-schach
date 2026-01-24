const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => { 
    res.writeHead(200); 
    res.end("Schach-Ultra-Server läuft!"); 
});
const wss = new WebSocket.Server({ server });

// --- DATEI-PFADE ---
const LB_FILE = './leaderboard.json';
const USER_FILE = './userDB.json';
const BAN_FILE = './bannedIPs.json';

// --- DATEN-SPEICHER ---
let leaderboard = {};
let userDB = {}; 
let bannedPlayers = new Set(); 
let bannedIPs = new Set(); 
let mutedPlayers = new Set(); 

const adminPass = "geheim123"; // Dein Passwort

// --- LADEN BEIM START ---
if (fs.existsSync(LB_FILE)) try { leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); } catch (e) {}
if (fs.existsSync(USER_FILE)) try { userDB = JSON.parse(fs.readFileSync(USER_FILE, 'utf8')); } catch (e) {}
if (fs.existsSync(BAN_FILE)) {
    try { 
        const savedIPs = JSON.parse(fs.readFileSync(BAN_FILE, 'utf8'));
        bannedIPs = new Set(savedIPs);
    } catch (e) {}
}

function saveAll() {
    try {
        fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
        fs.writeFileSync(USER_FILE, JSON.stringify(userDB, null, 2));
        fs.writeFileSync(BAN_FILE, JSON.stringify([...bannedIPs], null, 2));
    } catch (e) { console.error("Fehler beim Speichern:", e); }
}

function broadcast(msgObj) {
    const msg = JSON.stringify(msgObj);
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

function systemMsg(text) {
    broadcast({ type: 'chat', text: text, sender: 'SYSTEM', system: true });
}

wss.on('connection', (ws, req) => {
    // IP ERMITTELN (Wichtig für Ban)
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    ws.clientIP = clientIP;

    // SOFORTIGER IP-CHECK
    if (bannedIPs.has(ws.clientIP)) {
        ws.send(JSON.stringify({ type: 'chat', text: 'ZUGRIFF VERWEIGERT: Deine IP ist gebannt!', sender: 'SYSTEM' }));
        ws.terminate();
        return;
    }

    // Leaderboard senden
    const list = Object.entries(leaderboard).map(([name, wins]) => ({ name, wins })).sort((a,b)=>b.wins-a.wins).slice(0,5);
    ws.send(JSON.stringify({ type: 'leaderboard', list }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const inputName = (data.name || data.playerName || data.sender || "").trim();
            const inputPass = data.password || "";

            if (inputName) ws.playerName = inputName;

            // --- NICK-SCHUTZ & LOGIN ---
            if (data.type === 'join' || data.type === 'find_random') {
                if (inputName) {
                    if (!userDB[inputName]) {
                        userDB[inputName] = inputPass;
                        saveAll();
                    } else if (userDB[inputName] !== inputPass) {
                        ws.send(JSON.stringify({ type: 'chat', text: 'NICK GESCHÜTZT: Falsches Passwort!', sender: 'SYSTEM' }));
                        ws.terminate();
                        return;
                    }
                }
            }

            // --- ADMIN-LOGIK ---
            if (data.type === 'chat' && data.text.startsWith('/') && data.text.includes(adminPass)) {
                const parts = data.text.split(' ');
                const cmd = parts[0].toLowerCase();
                const target = parts[1];
                const textArg = parts.slice(1, -1).join(' '); // Für /say Befehl

                // KICK
                if (cmd === '/kick') {
                    wss.clients.forEach(c => {
                        if (c.playerName === target) {
                            c.send(JSON.stringify({ type: 'chat', text: 'Du wurdest gekickt!', sender: 'SYSTEM' }));
                            c.terminate();
                        }
                    });
                    systemMsg(`Spieler ${target} wurde gekickt.`);
                    return;
                }

                // BAN (IP + Name)
                if (cmd === '/ban') {
                    bannedPlayers.add(target);
                    wss.clients.forEach(c => {
                        if (c.playerName === target) {
                            bannedIPs.add(c.clientIP);
                            c.send(JSON.stringify({ type: 'chat', text: 'DU WURDEST GEBANNT!', sender: 'SYSTEM' }));
                            c.terminate();
                        }
                    });
                    saveAll();
                    systemMsg(`Spieler ${target} wurde permanent verbannt.`);
                    return;
                }

                // UNBAN
                if (cmd === '/unban') {
                    bannedPlayers.delete(target);
                    bannedIPs.delete(target);
                    saveAll();
                    systemMsg(`${target} wurde entbannt.`);
                    return;
                }

                // MUTE
                if (cmd === '/mute') {
                    mutedPlayers.add(target);
                    systemMsg(`${target} kann nun nicht mehr chatten.`);
                    return;
                }
                if (cmd === '/unmute') {
                    mutedPlayers.delete(target);
                    systemMsg(`${target} darf wieder chatten.`);
                    return;
                }

                // ADMIN ANKÜNDIGUNG
                if (cmd === '/say') {
                    broadcast({ type: 'chat', text: `📢 ADMIN: ${textArg}`, sender: 'ADMIN', system: true });
                    return;
                }

                // LIST BANS
                if (cmd === '/listbans') {
                    ws.send(JSON.stringify({ type: 'chat', text: `Bans: ${[...bannedPlayers].join(', ')} | IPs: ${[...bannedIPs].join(', ')}`, sender: 'SYSTEM' }));
                    return;
                }

                // LEADERBOARD CLEAR
                if (cmd === '/clearleaderboard') {
                    leaderboard = {};
                    saveAll();
                    systemMsg(`Das Leaderboard wurde vom Admin gelöscht.`);
                    broadcast({ type: 'leaderboard', list: [] });
                    return;
                }
            }

            // --- CHAT MUTE CHECK ---
            if (data.type === 'chat') {
                if (mutedPlayers.has(ws.playerName)) {
                    ws.send(JSON.stringify({ type: 'chat', text: 'Du bist stummgeschaltet!', sender: 'SYSTEM' }));
                    return;
                }
            }

            // --- NORMALE SPIEL-LOGIK ---
            if (data.type === 'win') {
                const name = data.name || ws.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveAll();
                const updatedList = Object.entries(leaderboard).map(([n, w]) => ({ name: n, wins: w })).sort((a,b)=>b.wins-a.wins).slice(0,5);
                broadcast({ type: 'leaderboard', list: updatedList });
            }

            // Weiterleitung von Zügen und Chat (Raum-basiert)
            if (data.type === 'find_random') {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "random_" + Math.random();
                    waitingPlayer.send(JSON.stringify({ type: 'join', room: roomID, color: 'white', systemMsg: "Gegner gefunden!" }));
                    ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black', systemMsg: "Gegner gefunden!" }));
                    waitingPlayer.room = roomID; ws.room = roomID;
                    waitingPlayer = null;
                } else { waitingPlayer = ws; }
            }

            if (data.type === 'join' && !data.type.startsWith('find_')) {
                ws.room = data.room;
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }

            if (data.type === 'chat' || data.type === 'move') {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === (data.room || ws.room)) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            // User-Counter Update
            broadcast({ type: 'user-count', count: wss.clients.size });

        } catch (e) { console.error("Nachrichtenfehler:", e); }
    });

    ws.on('close', () => { if(waitingPlayer === ws) waitingPlayer = null; });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server aktiv auf Port ${PORT}`));

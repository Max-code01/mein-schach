const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => { res.writeHead(200); res.end("Admin-Server aktiv."); });
const wss = new WebSocket.Server({ server });

const LB_FILE = './leaderboard.json';
let leaderboard = {};
let bannedPlayers = new Set(); 
let mutedPlayers = new Set(); // NEU: Mute-Liste

const adminPass = "geheim123";

if (fs.existsSync(LB_FILE)) {
    try { leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); } catch (e) { leaderboard = {}; }
}

function broadcastSystemMsg(text) {
    const msg = JSON.stringify({ type: 'chat', text: text, sender: 'System', system: true });
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. BEITRETEN (Namen am Socket registrieren)
            if (data.type === 'join') {
                if (bannedPlayers.has(data.name)) {
                    ws.send(JSON.stringify({ type: 'chat', text: 'DU BIST GEBANNT!', sender: 'SYSTEM' }));
                    ws.terminate();
                    return;
                }
                ws.room = data.room;
                ws.playerName = data.name; // DAS MUSS HIER STEHEN
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }

            // 2. ADMIN-ZENTRALE
            if (data.type === 'chat') {
                const text = data.text;

                // KICK: Wirft raus
                if (text.startsWith('/kick ')) {
                    const [_, target, pass] = text.split(' ');
                    if (pass === adminPass) {
                        wss.clients.forEach(c => { if(c.playerName === target) c.terminate(); });
                        broadcastSystemMsg(`Spieler ${target} wurde gekickt.`);
                        return;
                    }
                }

                // BAN: Blockiert Name dauerhaft (bis Neustart)
                if (text.startsWith('/ban ')) {
                    const [_, target, pass] = text.split(' ');
                    if (pass === adminPass) {
                        bannedPlayers.add(target);
                        wss.clients.forEach(c => { if(c.playerName === target) c.terminate(); });
                        broadcastSystemMsg(`Spieler ${target} wurde GEBANNT.`);
                        return;
                    }
                }

                // MUTE: Spieler darf nicht mehr schreiben
                if (text.startsWith('/mute ')) {
                    const [_, target, pass] = text.split(' ');
                    if (pass === adminPass) {
                        mutedPlayers.add(target);
                        broadcastSystemMsg(`Spieler ${target} wurde stummgeschaltet.`);
                        return;
                    }
                }

                // UNMUTE: Spieler darf wieder schreiben
                if (text.startsWith('/unmute ')) {
                    const [_, target, pass] = text.split(' ');
                    if (pass === adminPass) {
                        mutedPlayers.delete(target);
                        broadcastSystemMsg(`Spieler ${target} darf wieder sprechen.`);
                        return;
                    }
                }

                // WIPE: Alle Spieler gleichzeitig rauswerfen
                if (text === `/wipe ${adminPass}`) {
                    broadcastSystemMsg("SERVER-WIPE: Alle werden getrennt!");
                    wss.clients.forEach(c => c.terminate());
                    return;
                }

                // BROADCAST: Goldene Nachricht für alle
                if (text.startsWith('/alert ')) {
                    const msgContent = text.replace('/alert ', '').replace(adminPass, '');
                    if (text.includes(adminPass)) {
                        broadcastSystemMsg(`📢 ADMIN-DURCHSAGE: ${msgContent}`);
                        return;
                    }
                }

                // Chat-Sperre für Gemutete
                if (mutedPlayers.has(ws.playerName)) {
                    ws.send(JSON.stringify({ type: 'chat', text: 'Du bist stummgeschaltet!', sender: 'System' }));
                    return;
                }
            }

            // Normaler Chat & Move
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
server.listen(PORT, () => console.log(`God-Mode Server online!`));

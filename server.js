const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const { handleExtraCommands } = require('./adminBefehle.js');

// Füge das hier hinzu, damit globalMute funktioniert
let serverConfig = { globalMute: false };

// --- SERVER SETUP ---
const server = http.createServer((req, res) => { 
    res.writeHead(200); 
    res.end("Schach-Ultra-Server: MAXIMALE VOLLVERSION - ALLER CODE ENTHALTEN"); 
});
const wss = new WebSocket.Server({ server });

// --- DATEI-PFADE ---
const LB_FILE = './leaderboard.json';
const USER_FILE = './userDB.json';
const BAN_FILE = './bannedIPs.json';

// --- SERVER SPEICHER / VARIABLEN (ALLES VORHANDEN) ---
let leaderboard = {};
let userDB = {}; 
let bannedIPs = new Set(); 
let mutedPlayers = new Map(); 
let warnings = {}; 
let loginAttempts = new Map(); // Für den Hacker-Schutz
let waitingPlayer = null;
let serverLocked = false; 
let slowModeDelay = 0; 
let messageHistory = new Map(); 
let lastSentMessage = new Map(); 

const adminPass = "Admina111";

// --- NEU: HILFSFUNKTION FÜR DAS LEADERBOARD (Top 10) ---
function sendLeaderboardUpdate(target) {
    const sorted = Object.entries(leaderboard).sort((a,b) => b[1]-a[1]).slice(0, 10);
    const msg = JSON.stringify({ 
        type: 'leaderboard', 
        list: sorted.map(e => ({ name: e[0], wins: e[1] })) 
    });
    if (target) {
        target.send(msg);
    } else {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(msg);
        });
    }
}

// --- HILFSFUNKTION FÜR POPUP-NACHRICHTEN ---
const sendSystemAlert = (targetWs, message) => {
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify({ 
            type: 'system_alert', 
            message: message 
        }));
    }
};

// --- SICHERHEITS-LOGIK (XSS FILTER) ---
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m];
    });
}

// --- DATEN LADEN BEIM START (AUSFÜHRLICH) ---
function loadData() {
    if (fs.existsSync(LB_FILE)) {
        try {
            const data = fs.readFileSync(LB_FILE, 'utf8');
            leaderboard = JSON.parse(data);
        } catch (e) {
            console.log("Fehler beim Laden: Leaderboard");
        }
    }
    if (fs.existsSync(USER_FILE)) {
        try {
            const data = fs.readFileSync(USER_FILE, 'utf8');
            userDB = JSON.parse(data);
        } catch (e) {
            console.log("Fehler beim Laden: UserDB");
        }
    }
    if (fs.existsSync(BAN_FILE)) {
        try {
            const data = fs.readFileSync(BAN_FILE, 'utf8');
            const savedIPs = JSON.parse(data);
            bannedIPs = new Set(savedIPs);
        } catch (e) {
            console.log("Fehler beim Laden: Bans");
        }
    }
}
loadData();

// --- SPEICHER-FUNKTION ---
function saveAll() {
    try {
        fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
        fs.writeFileSync(USER_FILE, JSON.stringify(userDB, null, 2));
        fs.writeFileSync(BAN_FILE, JSON.stringify([...bannedIPs], null, 2));
    } catch (e) {
        console.log("Konnte Daten nicht speichern");
    }
}

// --- BROADCAST-FUNKTION (AN ALLE SENDEN) ---
function broadcast(msgObj) {
    const msg = JSON.stringify(msgObj);
    wss.clients.forEach(function(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// --- HAUPT-LOGIK (VERBINDUNGEN) ---
wss.on('connection', function(ws, req) {
    // IP-Erkennung
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    ws.clientIP = clientIP;
    ws.lastMessageTime = 0;

    // IP-BAN CHECK (SOFORT-BLOCK MIT POPUP)
    if (bannedIPs.has(ws.clientIP)) {
        sendSystemAlert(ws, '❌ ZUGRIFF VERWEIGERT: Deine IP ist permanent gebannt!');
        setTimeout(() => ws.terminate(), 1000);
        return;
    }

    // NEU: Sofort Namen zuweisen und Leaderboard schicken
    if (!ws.playerName) {
        const tempID = Math.floor(1000 + Math.random() * 9000);
        ws.playerName = "Spieler_" + tempID;
    }
    sendLeaderboardUpdate(ws);

    ws.on('message', function(message) {
        try {
            const data = JSON.parse(message);
            const inputName = (data.name || data.playerName || data.sender || "").trim();
            const inputPass = data.password || "";
            if (inputName) {
                ws.playerName = inputName;
            }

            // --- ADMIN LOGIK (KOMPLETTE LISTE + HACKER-SCHUTZ + LOGGING) ---
            if (data.type === 'chat' && data.text.startsWith('/')) {
                const parts = data.text.split(' ');
                const cmd = parts[0].toLowerCase();

                // Passwort-Sicherheits-Check
                if (!data.text.includes(adminPass)) {
                    let attempts = (loginAttempts.get(ws.clientIP) || 0) + 1;
                    loginAttempts.set(ws.clientIP, attempts);
                    
                    console.warn("⚠️ HACK-VERDACHT: " + inputName + " (" + ws.clientIP + ") nutzte falschen Admin-Befehl! Versuch: " + attempts + "/5");

                    if (attempts >= 5) {
                        console.error("🚨 AUTO-BAN: IP " + ws.clientIP + " wurde nach 5 Fehlversuchen gesperrt!");
                        bannedIPs.add(ws.clientIP);
                        saveAll();
                        sendSystemAlert(ws, '❌ ZU VIELE FEHLVERSUCHE: Du wurdest automatisch gebannt!');
                        setTimeout(() => ws.terminate(), 1000);
                    }
                    return; 
                }

                loginAttempts.set(ws.clientIP, 0);
                console.log("✅ ADMIN-AKTION: " + inputName + " nutzt Befehl: " + cmd);

                const target = parts[1];
                const targetLower = target ? target.toLowerCase() : "";
                const textArg = parts.slice(1, -1).join(' ');

                // 1. /warn
                if (cmd === '/warn') {
                    warnings[targetLower] = (warnings[targetLower] || 0) + 1;
                    broadcast({ type: 'chat', text: "WARNUNG für " + target + ": (" + warnings[targetLower] + "/3)", system: true });
                    
                    wss.clients.forEach(function(c) {
                        if (c.playerName && c.playerName.toLowerCase() === targetLower) {
                            sendSystemAlert(c, "⚠️ WARNUNG: Du hast eine Verwarnung erhalten! (" + warnings[targetLower] + "/3)");
                            if (warnings[targetLower] >= 3) {
                                setTimeout(() => c.terminate(), 1000);
                            }
                        }
                    });
                    return;
                }

                // 2. /mute
                if (cmd === '/mute') {
                    mutedPlayers.set(targetLower, Date.now() + 3600000); 
                    wss.clients.forEach(c => {
                        if(c.playerName && c.playerName.toLowerCase() === targetLower) {
                            sendSystemAlert(c, '🔇 Du wurdest stummgeschaltet.');
                        }
                    });
                    ws.send(JSON.stringify({ type: 'chat', text: target + " stummgeschaltet.", system: true }));
                    return;
                }

                // 3. /unmute
                if (cmd === '/unmute') {
                    mutedPlayers.delete(targetLower);
                    wss.clients.forEach(c => {
                        if(c.playerName && c.playerName.toLowerCase() === targetLower) {
                            sendSystemAlert(c, '🔊 Dein Mute wurde aufgehoben!');
                        }
                    });
                    ws.send(JSON.stringify({ type: 'chat', text: target + " entstummt.", system: true }));
                    return;
                }

                // 4. /kick
                if (cmd === '/kick') {
                    wss.clients.forEach(function(c) {
                        if (c.playerName && c.playerName.toLowerCase() === targetLower) {
                            sendSystemAlert(c, 'Du wurdest vom Admin gekickt!');
                            setTimeout(() => c.terminate(), 1000);
                        }
                    });
                    return;
                }

                // 5. /kickall
                if (cmd === '/kickall') {
                    wss.clients.forEach(function(c) {
                        if (c !== ws) {
                            sendSystemAlert(c, 'Der Server wurde vom Admin geleert.');
                            setTimeout(() => c.terminate(), 1000);
                        }
                    });
                    return;
                }

                // 6. /ban
                if (cmd === '/ban') {
                    wss.clients.forEach(function(c) {
                        if (c.playerName && c.playerName.toLowerCase() === targetLower) {
                            bannedIPs.add(c.clientIP);
                            sendSystemAlert(c, '❌ DU WURDEST PERMANENT GEBANNT!');
                            setTimeout(() => c.terminate(), 1000);
                        }
                    });
                    saveAll();
                    return;
                }

                // 7. /banip
                if (cmd === '/banip') {
                    bannedIPs.add(target);
                    wss.clients.forEach(c => {
                        if(c.clientIP === target) {
                            sendSystemAlert(c, '❌ DEINE IP WURDE GEBANNT!');
                            setTimeout(() => c.terminate(), 1000);
                        }
                    });
                    saveAll();
                    return;
                }

                // 8. /pardon
                if (cmd === '/pardon') {
                    bannedIPs.delete(target);
                    saveAll();
                    return;
                }

                // 9. /banlist
                if (cmd === '/banlist') {
                    const blist = Array.from(bannedIPs).join(', ');
                    ws.send(JSON.stringify({ type: 'chat', text: "Bans: " + blist, system: true }));
                    return;
                }

                // 10. /mutelist
                if (cmd === '/mutelist') {
                    const mlist = Array.from(mutedPlayers.keys()).join(', ');
                    ws.send(JSON.stringify({ type: 'chat', text: "Stumm: " + (mlist || "Keiner"), system: true }));
                    return;
                }

                // 11. /stats
                if (cmd === '/stats') {
                    ws.send(JSON.stringify({ type: 'chat', text: "Online: " + wss.clients.size + " | Bans: " + bannedIPs.size + " | Slow: " + slowModeDelay + "s", system: true }));
                    return;
                }

                // 12. /lock & /unlock
                if (cmd === '/lock') {
                    serverLocked = true;
                    broadcast({ type: 'chat', text: "SPIELFELD GESPERRT", system: true });
                    return;
                }
                if (cmd === '/unlock') {
                    serverLocked = false;
                    broadcast({ type: 'chat', text: "SPIELFELD FREIGEGEBEN", system: true });
                    return;
                }

                // 13. /slowmode
                if (cmd === '/slowmode') {
                    slowModeDelay = parseInt(target) || 0;
                    broadcast({ type: 'chat', text: "Slowmode: " + slowModeDelay + "s", system: true });
                    return;
                }

                // 14. /reset
                if (cmd === '/reset') {
                    wss.clients.forEach(function(c) {
                        if (c.room === ws.room) {
                            c.send(JSON.stringify({ type: 'join', room: ws.room }));
                        }
                    });
                    return;
                }

                // 15. /broadcast
                if (cmd === '/broadcast') {
                    broadcast({ type: 'chat', text: "📢 " + textArg.toUpperCase(), system: true });
                    return;
                }

                // 16. /wall
                if (cmd === '/wall') {
                    broadcast({ type: 'chat', text: "═════════════════════════\n" + textArg.toUpperCase() + "\n═════════════════════════", system: true });
                    return;
                }

                // 17. /cleardb
                if (cmd === '/cleardb') {
                    userDB = {};
                    saveAll();
                    ws.send(JSON.stringify({ type: 'chat', text: "Datenbank gelöscht!", system: true }));
                    return;
                }

                // 18. /help
                if (cmd === '/help') {
                    ws.send(JSON.stringify({ type: 'chat', text: "Befehle: /warn, /mute, /unmute, /kick, /kickall, /ban, /banip, /pardon, /banlist, /mutelist, /stats, /lock, /unlock, /slowmode, /reset, /broadcast, /wall, /cleardb", system: true }));
                    return;
                }
            }

            // --- SPIEL-KERNFUNKTIONEN ---

            // Login / Registrierung
            if (data.type === 'join' || data.type === 'find_random') {
                if (inputName) {
                    if (!userDB[inputName]) {
                        userDB[inputName] = inputPass;
                        saveAll();
                    } else if (userDB[inputName] !== inputPass) {
                        ws.send(JSON.stringify({ type: 'chat', text: 'Falsches Passwort!', system: true }));
                        ws.terminate();
                        return;
                    }
                }
            }

            // Random Matchmaking
            if (data.type === 'find_random') {
                if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
                    const roomID = "room_" + Math.random();
                    ws.room = roomID;
                    waitingPlayer.room = roomID;
                    ws.send(JSON.stringify({ type: 'join', room: roomID, color: 'black' }));
                    waitingPlayer.send(JSON.stringify({ type: 'join', room: roomID, color: 'white' }));
                    waitingPlayer = null;
                } else {
                    waitingPlayer = ws;
                }
                return;
            }

            // Chat & Züge
            if (data.type === 'chat' || data.type === 'move') {
                if (serverLocked && data.type === 'move') {
                    return;
                }

                if (data.type === 'chat') {
                    data.text = escapeHTML(data.text);
                    const now = Date.now();
                    const lowerName = inputName.toLowerCase();

                    // Anti-Spam (Slowmode & Mute Check)
                    if (now - ws.lastMessageTime < slowModeDelay * 1000) {
                        return;
                    }
                    if (mutedPlayers.has(lowerName) && now < mutedPlayers.get(lowerName)) {
                        sendSystemAlert(ws, '🔇 Du bist stummgeschaltet und kannst keine Nachrichten senden.');
                        return;
                    }
                    ws.lastMessageTime = now;
                }

                const targetRoom = data.room || ws.room;
                wss.clients.forEach(function(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.room === targetRoom) {
                        client.send(JSON.stringify(data));
                    }
                });
            }

            // Private Räume
            if (data.type === 'join' && !data.type.startsWith('find_')) {
                ws.room = data.room;
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }

            // Siege & Bestenliste (Top 10)
            if (data.type === 'win') {
                const name = data.name || ws.playerName || "Anonym";
                leaderboard[name] = (leaderboard[name] || 0) + 1;
                saveAll();
                sendLeaderboardUpdate();
            }

        } catch (e) {
            console.error("Fehler bei der Nachrichtenverarbeitung");
        }
    });

    ws.on('close', function() {
        if (waitingPlayer === ws) {
            waitingPlayer = null;
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, function() {
    console.log("MASTER-SERVER GESTARTET AUF PORT " + PORT);
});






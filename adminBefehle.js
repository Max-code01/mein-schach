// adminBefehle.js
const adminPass = "Admin111";

function handleExtraCommands(data, ws, wss, state) {
    if (!data.text || !data.text.startsWith('/')) return false;

    const parts = data.text.split(' ');
    const cmd = parts[0].toLowerCase();

    // --- NUTZER-BEFEHLE (Kein Passwort nötig) ---
    if (cmd === '/ping') {
        ws.send(JSON.stringify({ type: 'chat', text: "🏓 Pong! Verbindung stabil.", system: true }));
        return true;
    }
    if (cmd === '/roll') {
        const nr = Math.floor(Math.random() * 100) + 1;
        state.broadcast({ type: 'chat', text: `🎲 ${ws.playerName} würfelt eine: ${nr}`, system: true });
        return true;
    }
    if (cmd === '/zeit') {
        ws.send(JSON.stringify({ type: 'chat', text: "🕒 Serverzeit: " + new Date().toLocaleTimeString(), system: true }));
        return true;
    }
    if (cmd === '/regeln') {
        ws.send(JSON.stringify({ type: 'chat', text: "📜 1. Kein Spam | 2. Respekt | 3. Fairplay", system: true }));
        return true;
    }
    if (cmd === '/münze') {
        state.broadcast({ type: 'chat', text: `🪙 Münzwurf: ${Math.random() < 0.5 ? "KOPF" : "ZAHL"}`, system: true });
        return true;
    }

    // --- ADMIN-CHECK ---
    if (!data.text.includes(adminPass)) return false;

    // Passwort unsichtbar machen
    data.text = data.text.replace(adminPass, "").trim();
    const target = parts[1] ? parts[1].toLowerCase() : "";
    const extraMsg = parts.slice(2).join(' ');

    // --- ADMIN-BEFEHLE ---
    if (cmd === '/freeze') {
        wss.clients.forEach(c => { if (c.playerName?.toLowerCase() === target) { c.isFrozen = true; c.send(JSON.stringify({ type: 'chat', text: "❄️ Eingefroren!", system: true })); } });
        return true;
    }
    if (cmd === '/unfreeze') {
        wss.clients.forEach(c => { if (c.playerName?.toLowerCase() === target) c.isFrozen = false; });
        return true;
    }
    if (cmd === '/clear') {
        state.broadcast({ type: 'chat', text: "\n".repeat(100) + "✨ Chat geleert!", system: true });
        return true;
    }
    if (cmd === '/globalmute') {
        state.serverConfig.globalMute = true;
        state.broadcast({ type: 'chat', text: "🔇 Chat deaktiviert!", system: true });
        return true;
    }
    if (cmd === '/globalunmute') {
        state.serverConfig.globalMute = false;
        state.broadcast({ type: 'chat', text: "🔊 Chat aktiviert!", system: true });
        return true;
    }
    if (cmd === '/kickall') {
        wss.clients.forEach(c => { if(c !== ws) c.terminate(); });
        return true;
    }
    if (cmd === '/alert') {
        state.broadcast({ type: 'chat', text: "🚨 ADMIN: " + extraMsg, system: true });
        return true;
    }
    if (cmd === '/slow') {
        state.serverConfig.slowMode = parseInt(parts[1]) || 5;
        state.broadcast({ type: 'chat', text: `⏳ Slowmode: ${state.serverConfig.slowMode}s`, system: true });
        return true;
    }
    if (cmd === '/rename') {
        wss.clients.forEach(c => { if (c.playerName?.toLowerCase() === target) c.playerName = parts[2]; });
        return true;
    }
    if (cmd === '/status') {
        ws.send(JSON.stringify({ type: 'chat', text: `📊 Online: ${wss.clients.size}`, system: true }));
        return true;
    }

    return true; 
}

module.exports = { handleExtraCommands };

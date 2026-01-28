// adminBefehle.js
const adminPass = "Admina111"; 

function handleExtraCommands(data, ws, wss, state) {
    if (!data.text || !data.text.startsWith('/')) return false;

    const parts = data.text.split(' ');
    const cmd = parts[0].toLowerCase();
    
    // Hilfe-Seite braucht kein Passwort zum Anschauen
    if (cmd === '/help2') {
        const hilfe = "🌟 EXTRAS: /freeze, /unfreeze, /globalmute, /globalunmute, /clear, /system, /kickall, /slowmode, /spam, /warn, /setelo, /invisible, /fakejoin, /fakeleave, /nightmode, /daymode, /resetboard";
        ws.send(JSON.stringify({ type: 'chat', text: hilfe, system: true }));
        return true;
    }

    // SICHERHEIT: Alle anderen Befehle stoppen hier, wenn Admin111 fehlt
    if (!data.text.includes(adminPass)) return false;

    const targetName = parts[1];
    const targetLower = targetName ? targetName.toLowerCase() : "";
    // Der Text zwischen Befehl und Passwort
    const extraText = parts.slice(1, -1).join(' '); 

    // --- LOGIK DER BEFEHLE ---

    if (cmd === '/freeze') {
        wss.clients.forEach(c => {
            if (c.playerName && c.playerName.toLowerCase() === targetLower) {
                c.isFrozen = true;
                c.send(JSON.stringify({ type: 'chat', text: "❄️ Du bist eingefroren!", system: true }));
            }
        });
        return true;
    }

    if (cmd === '/unfreeze') {
        wss.clients.forEach(c => {
            if (c.playerName && c.playerName.toLowerCase() === targetLower) c.isFrozen = false;
        });
        return true;
    }

    if (cmd === '/globalmute') {
        state.serverConfig.globalMute = true;
        state.broadcast({ type: 'chat', text: "🔇 Chat global deaktiviert!", system: true });
        return true;
    }

    if (cmd === '/globalunmute') {
        state.serverConfig.globalMute = false;
        state.broadcast({ type: 'chat', text: "🔊 Chat wieder aktiv!", system: true });
        return true;
    }

    if (cmd === '/clear') {
        state.broadcast({ type: 'chat', text: "\n".repeat(60) + "✨ Chat geleert!", system: true });
        return true;
    }

    if (cmd === '/system') {
        state.broadcast({ type: 'chat', text: "⚠️ " + extraText, system: true });
        return true;
    }

    if (cmd === '/setelo') {
        // Ändert das Leaderboard im Speicher (state)
        const points = parseInt(parts[2]) || 0;
        state.leaderboard[targetName] = points;
        state.saveAll();
        state.broadcast({ type: 'chat', text: `🏆 Elo von ${targetName} auf ${points} gesetzt.`, system: true });
        return true;
    }

    if (cmd === '/invisible') {
        ws.playerName = " "; // Name wird fast unsichtbar
        ws.send(JSON.stringify({ type: 'chat', text: "👻 Du bist jetzt im Tarnmodus.", system: true }));
        return true;
    }

    if (cmd === '/spam') {
        for(let i=0; i<5; i++) state.broadcast({ type: 'chat', text: extraText });
        return true;
    }

    return false;
}

module.exports = { handleExtraCommands };

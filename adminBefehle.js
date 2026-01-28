// adminBefehle.js

function handleExtraCommands(data, ws, wss, state) {
    const parts = data.text.split(' ');
    const cmd = parts[0].toLowerCase();
    const target = parts[1];
    
    // BEISPIEL: Ein neuer Befehl nur für diese Datei
    if (cmd === '/msg') {
        const text = parts.slice(2, -1).join(' '); // Nachricht ohne Passwort
        wss.clients.forEach(client => {
            if (client.playerName === target) {
                client.send(JSON.stringify({ type: 'chat', text: "[Privat] " + text, system: true }));
            }
        });
        return true; 
    }

    // Hier kannst du jetzt beliebig viele NEUE Befehle einfügen
    // if (cmd === '/dein_neuer_befehl') { ... }

    return false; // Falls kein neuer Befehl erkannt wurde
}

module.exports = { handleExtraCommands };

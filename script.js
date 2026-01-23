// ==========================================
// 1. INITIALISIERUNG & VARIABLEN
// ==========================================
var board = null;
var game = new Chess();
var currentRoom = null;
var playerColor = 'white';

// WICHTIG: Ersetze die URL durch deine echte Render-URL!
const socket = new WebSocket('wss://dein-projekt-name.onrender.com');

// ==========================================
// 2. SOUND-SYSTEM (Erzeugt Töne im Browser)
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'move') {
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'win') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // Note C5
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    }
}

// ==========================================
// 3. WEBSOCKET-KOMMUNIKATION
// ==========================================
socket.onmessage = function(event) {
    const data = JSON.parse(event.data);

    // Leaderboard empfangen und anzeigen
    if (data.type === 'leaderboard') {
        const list = document.getElementById('leaderboard-list');
        if (list) {
            list.innerHTML = '';
            data.list.forEach((player, i) => {
                let medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
                list.innerHTML += `
                    <div class="leaderboard-entry">
                        <span class="rank">${i+1}.</span>
                        <span class="name">${medal} ${player.name}</span>
                        <span class="wins">${player.wins} 🏆</span>
                    </div>`;
            });
        }
    }

    // Einem Online-Spiel beitreten
    if (data.type === 'join') {
        currentRoom = data.room;
        playerColor = data.color || 'white';
        game.reset();
        board.orientation(playerColor);
        board.position('start');
        
        // Undo-Button optisch deaktivieren
        document.getElementById('undoBtn').classList.add('disabled');
        alert("Spiel gestartet! Deine Farbe: " + (playerColor === 'white' ? "Weiß" : "Schwarz"));
    }

    // Zug vom Gegner empfangen
    if (data.type === 'move') {
        game.move(data.move);
        board.position(game.fen());
        playSound('move');
        checkGameOver();
    }

    // Chat-Nachricht empfangen
    if (data.type === 'chat') {
        const chatLog = document.getElementById('chat-log');
        if (chatLog) {
            chatLog.innerHTML += `<div><b>Gegner:</b> ${data.msg}</div>`;
            chatLog.scrollTop = chatLog.scrollHeight;
        }
    }

    // Online-User zählen
    if (data.type === 'user-count') {
        const countElem = document.getElementById('user-count');
        if (countElem) countElem.innerText = "Online: " + data.count;
    }
};

// ==========================================
// 4. SCHACH-LOGIK & BOARD-EVENTS
// ==========================================
function onDragStart(source, piece, position, orientation) {
    if (game.game_over()) return false;
    
    // Im Online-Modus: Nur eigene Steine ziehen
    if (currentRoom) {
        if ((playerColor === 'white' && piece.search(/^b/) !== -1) ||
            (playerColor === 'black' && piece.search(/^w/) !== -1)) {
            return false;
        }
    }
}

function onDrop(source, target) {
    var move = game.move({
        from: source,
        to: target,
        promotion: 'q' 
    });

    if (move === null) return 'snapback';

    playSound('move');

    if (currentRoom) {
        // Zug an den Server senden
        socket.send(JSON.stringify({ type: 'move', move: move, room: currentRoom }));
    } else {
        // Gegen den Bot: Bot zieht nach 500ms
        window.setTimeout(makeBotMove, 500);
    }

    checkGameOver();
}

function onSnapEnd() {
    board.position(game.fen());
}

// ==========================================
// 5. BOT-LOGIK (Einfache KI)
// ==========================================
function makeBotMove() {
    var possibleMoves = game.moves();
    if (game.game_over()) return;

    // Zufälliger Zug
    var randomIdx = Math.floor(Math.random() * possibleMoves.length);
    game.move(possibleMoves[randomIdx]);
    
    board.position(game.fen());
    playSound('move');
    checkGameOver();
}

// ==========================================
// 6. GEWINN-PRÜFUNG
// ==========================================
function checkGameOver() {
    if (game.game_over()) {
        playSound('win');
        
        // Wenn man selbst gewonnen hat (am Zug ist der andere), Sieg an Server melden
        if (game.in_checkmate()) {
            const myName = document.getElementById('playerNameInput').value || "Anonym";
            socket.send(JSON.stringify({ type: 'win', playerName: myName }));
            alert("Schachmatt! Sieg eingetragen.");
        } else {
            alert("Spiel beendet!");
        }
    }
}

// ==========================================
// 7. INTERAKTIONEN (BUTTONS)
// ==========================================

// RÜCKGÄNGIG TASTE
document.getElementById('undoBtn').addEventListener('click', function() {
    if (currentRoom) {
        alert("Im Online-Modus darfst du nicht schummeln!");
        return;
    }
    // Bot-Modus: Deinen UND den Bot-Zug rückgängig machen
    game.undo();
    game.undo();
    board.position(game.fen());
    playSound('move');
});

// GEGNER SUCHEN
document.getElementById('findRandomBtn').addEventListener('click', function() {
    socket.send(JSON.stringify({ type: 'find_random' }));
});

// CHAT SENDEN
function sendChatMessage() {
    const input = document.getElementById('chatInput');
    if (input.value && currentRoom) {
        socket.send(JSON.stringify({ type: 'chat', msg: input.value, room: currentRoom }));
        const chatLog = document.getElementById('chat-log');
        chatLog.innerHTML += `<div><b>Du:</b> ${input.value}</div>`;
        chatLog.scrollTop = chatLog.scrollHeight;
        input.value = '';
    }
}

document.getElementById('sendChatBtn').addEventListener('click', sendChatMessage);

// ==========================================
// 8. BOARD STARTEN
// ==========================================
var config = {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
};

board = Chessboard('myBoard', config);

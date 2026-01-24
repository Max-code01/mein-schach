/**
 * SCHACH LIVE - ULTIMATIVE VOLLVERSION
 * -----------------------------------------
 * Features: 
 * - LocalStorage Erfolgsspeicher
 * - Stockfish Engine Integration
 * - WebSocket Multiplayer
 * - Dynamische Farbwahl
 * - Zugvorschläge (Punkte)
 * - System-Nachrichten im Chat
 */

// --- 1. GLOBALE ELEMENTE (DOM) ---
const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const gameModeSelect = document.getElementById("gameMode");
const nameInput = document.getElementById("playerName");
const achListEl = document.getElementById("achievement-list");
const cpW = document.getElementById("colorWhite");
const cpB = document.getElementById("colorBlack");

// --- 2. ENGINE & NETZWERK SETUP ---
const stockfishWorker = new Worker('engineWorker.js'); 
const socket = new WebSocket("wss://mein-schach-vo91.onrender.com");

// Sound-Effekte
const sounds = {
    move: new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/move-self.mp3'),
    cap: new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/capture.mp3'),
    check: new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/move-check.mp3')
};

// Figuren-Bilder (SVG)
const PIECES = {
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg', 
    'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg', 
    'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg', 
    'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg', 
    'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg', 
    'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg', 
    'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg'
};

// --- 3. SPIEL-VARIABLEN ---
let board = [];
let turn = "white";
let selected = null;
let history = [];
let myColor = "white";
let onlineRoom = null;
let possibleMoves = [];

// --- 4. ERFOLGE-SYSTEM (Lokal gespeichert) ---
let achievements = JSON.parse(localStorage.getItem('chessAchievements')) || {
    firstWin: { name: "Erster Sieg", icon: "🏆", earned: false },
    pawnMaster: { name: "Bauern-Profi", icon: "👑", earned: false },
    undoKing: { name: "Zeit-Reisender", icon: "⏳", earned: false },
    firstBlood: { name: "Erster Schlag", icon: "⚔️", earned: false }
};

/**
 * Aktualisiert die Anzeige der Medaillen in der Sidebar
 */
function updateAchievementDisplay() {
    achListEl.innerHTML = "";
    Object.keys(achievements).forEach(id => {
        if (achievements[id].earned) {
            const span = document.createElement("span");
            span.textContent = achievements[id].icon;
            span.title = achievements[id].name;
            span.style.cursor = "help";
            achListEl.appendChild(span);
        }
    });
}

/**
 * Schaltet einen Erfolg frei und speichert ihn dauerhaft
 */
function unlockAchievement(id) {
    if (achievements[id] && !achievements[id].earned) {
        achievements[id].earned = true;
        localStorage.setItem('chessAchievements', JSON.stringify(achievements));
        
        // System-Nachricht im Chat ausgeben
        addChat("System", `ERFOLG FREIGESCHALTET: ${achievements[id].icon} ${achievements[id].name}`, "system");
        
        updateAchievementDisplay();
        sounds.check.play();
    }
}

// --- 5. CHAT-FUNKTIONEN ---

/**
 * Fügt eine Nachricht zum Chat-Fenster hinzu
 */
function addChat(sender, text, type) {
    const msgDiv = document.createElement("div");
    
    if (type === "system") {
        msgDiv.className = "msg system-msg";
        msgDiv.innerHTML = `⚙️ <strong>SYSTEM:</strong> ${text}`;
    } else {
        msgDiv.className = (type === 'me') ? "msg my-msg" : "msg other-msg";
        msgDiv.innerHTML = `<strong>${sender}:</strong> ${text}`;
    }
    
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- 6. SCHACH-LOGIK & REGELN ---

function isOwnPiece(piece, color = turn) {
    if (!piece) return false;
    if (color === "white") return piece === piece.toUpperCase();
    return piece === piece.toLowerCase();
}

function findKing(color) {
    const target = (color === "white" ? "K" : "k");
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] === target) return { r, c };
        }
    }
    return null;
}

/**
 * Kern-Logik für erlaubte Züge jeder Figur
 */
function canMoveLogic(fr, fc, tr, tc, testBoard = board) {
    const piece = testBoard[fr][fc];
    if (!piece) return false;

    const target = testBoard[tr][tc];
    // Eigene Figuren schlagen ist verboten
    if (target && isOwnPiece(target, isOwnPiece(piece, "white") ? "white" : "black")) return false;

    const dr = Math.abs(tr - fr);
    const dc = Math.abs(tc - fc);
    const type = piece.toLowerCase();

    // Bauern-Logik
    if (type === 'p') {
        const dir = (piece === 'P') ? -1 : 1;
        // Vorwärts
        if (fc === tc && testBoard[tr][tc] === "") {
            if (tr - fr === dir) return true;
            if (tr - fr === 2 * dir && (fr === 1 || fr === 6) && testBoard[fr + dir][fc] === "") return true;
        } 
        // Schlagen
        else if (dc === 1 && tr - fr === dir && testBoard[tr][tc] !== "") {
            return true;
        }
        return false;
    }

    // Pfadprüfung für Linien-Figur (Turm, Läufer, Dame)
    const isPathClear = () => {
        const rowDir = Math.sign(tr - fr);
        const colDir = Math.sign(tc - fc);
        let currR = fr + rowDir;
        let currC = fc + colDir;
        while (currR !== tr || currC !== tc) {
            if (testBoard[currR][currC] !== "") return false;
            currR += rowDir;
            currC += colDir;
        }
        return true;
    };

    if (type === 'r') return (fr === tr || fc === tc) && isPathClear();
    if (type === 'b') return dr === dc && isPathClear();
    if (type === 'q') return (fr === tr || fc === tc || dr === dc) && isPathClear();
    if (type === 'n') return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
    if (type === 'k') return dr <= 1 && dc <= 1;

    return false;
}

/**
 * Prüft, ob ein Feld von einer bestimmten Farbe angegriffen wird
 */
function isAttacked(row, col, attackerColor) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && isOwnPiece(piece, attackerColor)) {
                if (canMoveLogic(r, c, row, col)) return true;
            }
        }
    }
    return false;
}

/**
 * Verhindert Züge, die den eigenen König ins Schach stellen würden
 */
function isSafeMove(fr, fc, tr, tc) {
    const piece = board[fr][fc];
    const target = board[tr][tc];
    
    // Simulierter Zug
    board[tr][tc] = piece;
    board[fr][fc] = "";
    
    const kingPos = findKing(turn);
    const attackerColor = (turn === "white" ? "black" : "white");
    const safe = kingPos ? !isAttacked(kingPos.r, kingPos.c, attackerColor) : true;
    
    // Zug rückgängig machen
    board[fr][fc] = piece;
    board[tr][tc] = target;
    return safe;
}

// --- 7. SPIEL-INTERAKTIONEN ---

/**
 * Führt einen Zug aus und wechselt die Phase
 */
function doMove(fr, fc, tr, tc, emit = true) {
    // History speichern für Undo
    history.push(JSON.stringify({ b: board.map(row => [...row]), t: turn }));

    // Achievement: Erster Schlag
    if (board[tr][tc] !== "") unlockAchievement("firstBlood");

    // Bewegung ausführen
    board[tr][tc] = board[fr][fc];
    board[fr][fc] = "";

    // Bauernumwandlung zu Dame
    if (board[tr][tc] === 'P' && tr === 0) { board[tr][tc] = 'Q'; unlockAchievement("pawnMaster"); }
    if (board[tr][tc] === 'p' && tr === 7) { board[tr][tc] = 'q'; unlockAchievement("pawnMaster"); }

    // Synchronisation bei Online-Spiel
    if (emit && socket.readyState === 1 && (gameModeSelect.value === "online" || gameModeSelect.value === "random")) {
        socket.send(JSON.stringify({ type: 'move', move: { fr, fc, tr, tc }, room: onlineRoom }));
    }

    // Zugwechsel
    turn = (turn === "white" ? "black" : "white");
    
    const k = findKing(turn);
    const inCheck = isAttacked(k.r, k.c, turn === "white" ? "black" : "white");
    
    if (inCheck) sounds.check.play(); else sounds.move.play();

    // Spielende prüfen
    checkGameState(inCheck);

    selected = null;
    possibleMoves = [];
    draw();

    // Bot-Zug triggern
    if (turn === "black" && gameModeSelect.value === "bot") {
        stockfishWorker.postMessage({ board, turn: "black" });
    }
}

/**
 * Prüft auf Matt oder Patt
 */
function checkGameState(inCheck) {
    let moves = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && isOwnPiece(board[r][c])) {
                for (let tr = 0; tr < 8; tr++) {
                    for (let tc = 0; tc < 8; tc++) {
                        if (canMoveLogic(r, c, tr, tc) && isSafeMove(r, c, tr, tc)) moves++;
                    }
                }
            }
        }
    }

    if (moves === 0) {
        if (inCheck) {
            const winner = (turn === "white" ? "Schwarz" : "Weiß");
            statusEl.textContent = `MATT! ${winner} GEWINNT!`;
            if (winner === "Weiß" && myColor === "white") unlockAchievement("firstWin");
        } else {
            statusEl.textContent = "PATT! Unentschieden.";
        }
    } else {
        statusEl.textContent = (turn === "white" ? "Weiß" : "Schwarz") + (inCheck ? " steht im Schach!" : " am Zug");
    }
}

/**
 * Zeichnet das komplette Schachbrett neu
 */
function draw() {
    boardEl.innerHTML = "";
    const k = findKing(turn);
    const inCheck = k ? isAttacked(k.r, k.c, turn === "white" ? "black" : "white") : false;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = document.createElement("div");
            square.className = `square ${(r + c) % 2 ? "black-sq" : "white-sq"}`;
            
            // Highlights
            if (selected && selected.r === r && selected.c === c) square.classList.add("selected");
            if (inCheck && board[r][c] && board[r][c].toLowerCase() === 'k' && isOwnPiece(board[r][c])) {
                square.classList.add("in-check");
            }

            // Zug-Vorschau (Punkte)
            if (possibleMoves.some(m => m.tr === r && m.tc === c)) {
                const dot = document.createElement("div");
                dot.className = "possible-move-dot";
                if (board[r][c] !== "") dot.classList.add("capture-hint");
                square.appendChild(dot);
            }

            // Figur einfügen
            if (board[r][c]) {
                const img = document.createElement("img");
                img.src = PIECES[board[r][c]];
                img.style.width = "85%";
                square.appendChild(img);
            }

            // Klick-Logik
            square.onclick = () => {
                const isOnline = (gameModeSelect.value === "online" || gameModeSelect.value === "random");
                if (isOnline && turn !== myColor) return;

                if (selected) {
                    if (canMoveLogic(selected.r, selected.c, r, c) && isSafeMove(selected.r, selected.c, r, c)) {
                        doMove(selected.r, selected.c, r, c);
                    } else if (board[r][c] && isOwnPiece(board[r][c])) {
                        selected = { r, c };
                        calculateHints(r, c);
                    } else {
                        selected = null;
                        possibleMoves = [];
                        draw();
                    }
                } else if (board[r][c] && isOwnPiece(board[r][c])) {
                    selected = { r, c };
                    calculateHints(r, c);
                }
            };
            boardEl.appendChild(square);
        }
    }
    updateBoardColors();
}

/**
 * Berechnet alle möglichen Züge für die ausgewählte Figur (Punkte-Anzeige)
 */
function calculateHints(r, c) {
    possibleMoves = [];
    for (let tr = 0; tr < 8; tr++) {
        for (let tc = 0; tc < 8; tc++) {
            if (canMoveLogic(r, c, tr, tc) && isSafeMove(r, c, tr, tc)) {
                possibleMoves.push({ tr, tc });
            }
        }
    }
    draw();
}

// --- 8. DESIGN & FARBEN ---

function updateBoardColors() {
    document.querySelectorAll(".white-sq").forEach(s => s.style.backgroundColor = cpW.value);
    document.querySelectorAll(".black-sq").forEach(s => s.style.backgroundColor = cpB.value);
}
cpW.oninput = updateBoardColors;
cpB.oninput = updateBoardColors;

// --- 9. EVENT LISTENERS ---

// Rückgängig-Button
document.getElementById("undoBtn").onclick = () => {
    if (history.length > 0) {
        unlockAchievement("undoKing");
        const last = JSON.parse(history.pop());
        board = last.b;
        turn = last.t;
        
        // Beim Bot-Modus 2 Züge zurück (damit man wieder selbst dran ist)
        if (gameModeSelect.value === "bot" && history.length > 0) {
            const prev = JSON.parse(history.pop());
            board = prev.b;
            turn = prev.t;
        }
        
        selected = null;
        possibleMoves = [];
        draw();
    }
};

// Reset-Button
document.getElementById("resetBtn").onclick = () => {
    resetGame();
};

// Multiplayer Beitreten
document.getElementById("connectMP").onclick = () => {
    const id = document.getElementById("roomID").value || "global";
    const name = nameInput.value || "Spieler";
    socket.send(JSON.stringify({ type: 'join', room: id, name: name }));
};

// Chat senden
document.getElementById("send-chat").onclick = () => {
    const txt = chatInput.value.trim();
    if (txt && socket.readyState === 1) {
        socket.send(JSON.stringify({ 
            type: 'chat', 
            text: txt, 
            sender: nameInput.value || "Spieler", 
            room: onlineRoom 
        }));
        addChat("Ich", txt, "me");
        chatInput.value = "";
    }
};

// --- 10. NETZWERK & ENGINE HANDLER ---

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'move') {
        doMove(data.move.fr, data.move.fc, data.move.tr, data.move.tc, false);
    }
    if (data.type === 'chat') {
        addChat(data.sender, data.text, "other");
    }
    if (data.type === 'user-count') {
        document.getElementById("user-counter").textContent = "Online: " + data.count;
    }
    if (data.type === 'join') { 
        onlineRoom = data.room; 
        myColor = data.color || "white";
        // Brett für Schwarz drehen
        (myColor === "black") ? boardEl.classList.add("flipped") : boardEl.classList.remove("flipped");
        
        addChat("System", `Raum ${data.room} beigetreten als ${myColor === "white" ? "Weiß" : "Schwarz"}.`, "system");
        resetGame();
    }
};

stockfishWorker.onmessage = (e) => {
    if (e.data && turn === "black") {
        setTimeout(() => {
            doMove(e.data.fr, e.data.fc, e.data.tr, e.data.tc, false);
        }, 500);
    }
};

// --- 11. INITIALISIERUNG BEIM START ---

function resetGame() {
    board = [
        ["r","n","b","q","k","b","n","r"],
        ["p","p","p","p","p","p","p","p"],
        ["","","","","","","",""],
        ["","","","","","","",""],
        ["","","","","","","",""],
        ["","","","","","","",""],
        ["P","P","P","P","P","P","P","P"],
        ["R","N","B","Q","K","B","N","R"]
    ];
    turn = "white";
    selected = null;
    possibleMoves = [];
    statusEl.textContent = "Weiß am Zug";
    draw();
}

// App starten
updateAchievementDisplay();
resetGame();

// Finale Nachricht beim Laden
console.log("Schach-System bereit!");

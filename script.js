// --- ELEMENTE ---
const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const gameModeSelect = document.getElementById("gameMode");
const nameInput = document.getElementById("playerName");
const achListEl = document.getElementById("achievement-list");
const cpW = document.getElementById("colorWhite");
const cpB = document.getElementById("colorBlack");

// --- SETUP ---
const stockfishWorker = new Worker('engineWorker.js'); 
const socket = new WebSocket("wss://mein-schach-vo91.onrender.com");

const sounds = {
    move: new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/move-self.mp3'),
    cap: new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/capture.mp3'),
    check: new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/move-check.mp3')
};

const PIECES = {
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg', 'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg', 'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg', 'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg', 'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg', 'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg', 'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg'
};

let board = [], turn = "white", selected = null, history = [], myColor = "white", onlineRoom = null, possibleMoves = [];

let achievements = JSON.parse(localStorage.getItem('chessAchievements')) || {
    firstWin: { name: "Erster Sieg", icon: "🏆", earned: false },
    pawnMaster: { name: "Bauern-Profi", icon: "👑", earned: false },
    undoKing: { name: "Zeit-Reisender", icon: "⏳", earned: false },
    firstBlood: { name: "Erster Schlag", icon: "⚔️", earned: false }
};

// --- FUNKTIONEN ---

function updateAchievementDisplay() {
    achListEl.innerHTML = "";
    Object.keys(achievements).forEach(id => {
        if (achievements[id].earned) {
            const span = document.createElement("span");
            span.textContent = achievements[id].icon;
            span.title = achievements[id].name;
            achListEl.appendChild(span);
        }
    });
}

function unlockAchievement(id) {
    if (achievements[id] && !achievements[id].earned) {
        achievements[id].earned = true;
        localStorage.setItem('chessAchievements', JSON.stringify(achievements));
        addChat("System", `ERFOLG FREIGESCHALTET: ${achievements[id].icon} ${achievements[id].name}`, "system");
        updateAchievementDisplay();
        sounds.check.play();
    }
}

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

// --- LOGIK ---

function isOwnPiece(p, c = turn) {
    if (!p) return false;
    return (c === "white") ? p === p.toUpperCase() : p === p.toLowerCase();
}

function findKing(c) {
    const t = (c === "white" ? "K" : "k");
    for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) if (board[r][col] === t) return { r, c: col };
    return null;
}

function canMoveLogic(fr, fc, tr, tc, testBoard = board) {
    const p = testBoard[fr][fc]; if (!p) return false;
    const target = testBoard[tr][tc];
    if (target && isOwnPiece(target, isOwnPiece(p, "white") ? "white" : "black")) return false;
    const dr = Math.abs(tr - fr), dc = Math.abs(tc - fc), type = p.toLowerCase();

    if (type === 'p') {
        const dir = (p === 'P') ? -1 : 1;
        if (fc === tc && testBoard[tr][tc] === "") {
            if (tr - fr === dir) return true;
            if (tr - fr === 2 * dir && (fr === 1 || fr === 6) && testBoard[fr + dir][fc] === "") return true;
        } else if (dc === 1 && tr - fr === dir && testBoard[tr][tc] !== "") return true;
        return false;
    }
    const isPathClear = () => {
        const rD = Math.sign(tr - fr), cD = Math.sign(tc - fc);
        let r = fr + rD, c = fc + cD;
        while (r !== tr || c !== tc) { if (testBoard[r][c] !== "") return false; r += rD; c += cD; }
        return true;
    };
    if (type === 'r') return (fr === tr || fc === tc) && isPathClear();
    if (type === 'b') return dr === dc && isPathClear();
    if (type === 'q') return (fr === tr || fc === tc || dr === dc) && isPathClear();
    if (type === 'n') return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
    if (type === 'k') return dr <= 1 && dc <= 1;
    return false;
}

function isAttacked(row, col, attackerColor) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) 
        if (board[r][c] && isOwnPiece(board[r][c], attackerColor) && canMoveLogic(r, c, row, col)) return true;
    return false;
}

function isSafeMove(fr, fc, tr, tc) {
    const p = board[fr][fc], t = board[tr][tc];
    board[tr][tc] = p; board[fr][fc] = "";
    const k = findKing(turn);
    const safe = k ? !isAttacked(k.r, k.c, turn === "white" ? "black" : "white") : true;
    board[fr][fc] = p; board[tr][tc] = t;
    return safe;
}

// --- AKTIONEN ---

function doMove(fr, fc, tr, tc, emit = true) {
    history.push(JSON.stringify({ b: board.map(row => [...row]), t: turn }));
    if (board[tr][tc] !== "") unlockAchievement("firstBlood");
    board[tr][tc] = board[fr][fc]; board[fr][fc] = "";
    if (board[tr][tc] === 'P' && tr === 0) board[tr][tc] = 'Q';
    if (board[tr][tc] === 'p' && tr === 7) board[tr][tc] = 'q';

    if (emit && socket.readyState === 1 && (gameModeSelect.value === "online" || gameModeSelect.value === "random")) {
        socket.send(JSON.stringify({ type: 'move', move: { fr, fc, tr, tc }, room: onlineRoom }));
    }

    turn = (turn === "white" ? "black" : "white");
    const k = findKing(turn), inCheck = isAttacked(k.r, k.c, turn === "white" ? "black" : "white");
    if (inCheck) sounds.check.play(); else sounds.move.play();

    checkGameState(inCheck);
    selected = null; possibleMoves = []; draw();

    if (turn === "black" && gameModeSelect.value === "bot") {
        stockfishWorker.postMessage({ board, turn: "black" });
    }
}

function checkGameState(inCheck) {
    let moves = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) 
        if (board[r][c] && isOwnPiece(board[r][c])) 
            for (let tr = 0; tr < 8; tr++) for (let tc = 0; tc < 8; tc++) 
                if (canMoveLogic(r, c, tr, tc) && isSafeMove(r, c, tr, tc)) moves++;

    if (moves === 0) {
        if (inCheck) {
            const winner = (turn === "white" ? "Schwarz" : "Weiß");
            statusEl.textContent = `MATT! ${winner} GEWINNT!`;
            addChat("System", `Das Spiel endet durch Schachmatt. ${winner} gewinnt!`, "system");
            if (winner === "Weiß" && myColor === "white") unlockAchievement("firstWin");
        } else {
            statusEl.textContent = "PATT!";
            addChat("System", "Das Spiel endet unentschieden durch Patt.", "system");
        }
    } else {
        statusEl.textContent = (turn === "white" ? "Weiß" : "Schwarz") + (inCheck ? " im Schach!" : " am Zug");
    }
}

function draw() {
    boardEl.innerHTML = "";
    const k = findKing(turn);
    const inCheck = k ? isAttacked(k.r, k.c, turn === "white" ? "black" : "white") : false;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement("div");
            sq.className = `square ${(r + c) % 2 ? "black-sq" : "white-sq"}`;
            if (selected && selected.r === r && selected.c === c) sq.classList.add("selected");
            if (inCheck && board[r][c] && board[r][c].toLowerCase() === 'k' && isOwnPiece(board[r][c])) sq.classList.add("in-check");
            
            if (possibleMoves.some(m => m.tr === r && m.tc === c)) {
                const dot = document.createElement("div");
                dot.className = "possible-move-dot " + (board[r][c] ? "capture-hint" : "");
                sq.appendChild(dot);
            }
            if (board[r][c]) {
                const img = document.createElement("img");
                img.src = PIECES[board[r][c]]; img.style.width = "85%";
                sq.appendChild(img);
            }
            sq.onclick = () => {
                if ((gameModeSelect.value === "online" || gameModeSelect.value === "random") && turn !== myColor) return;
                if (selected) {
                    if (canMoveLogic(selected.r, selected.c, r, c) && isSafeMove(selected.r, selected.c, r, c)) {
                        doMove(selected.r, selected.c, r, c);
                    } else {
                        selected = (board[r][c] && isOwnPiece(board[r][c])) ? { r, c } : null;
                        updateHints(selected);
                    }
                } else if (board[r][c] && isOwnPiece(board[r][c])) {
                    selected = { r, c }; updateHints(selected);
                }
            };
            boardEl.appendChild(sq);
        }
    }
    document.querySelectorAll(".white-sq").forEach(s => s.style.backgroundColor = cpW.value);
    document.querySelectorAll(".black-sq").forEach(s => s.style.backgroundColor = cpB.value);
}

function updateHints(sel) {
    possibleMoves = [];
    if (sel) {
        for (let tr = 0; tr < 8; tr++) for (let tc = 0; tc < 8; tc++) 
            if (canMoveLogic(sel.r, sel.c, tr, tc) && isSafeMove(sel.r, sel.c, tr, tc)) possibleMoves.push({ tr, tc });
    }
    draw();
}

// --- BUTTONS ---

document.getElementById("resignBtn").onclick = () => {
    addChat("System", "Du hast das Spiel aufgegeben.", "system");
    statusEl.textContent = "Aufgegeben - Gegner gewinnt";
    if (socket.readyState === 1 && onlineRoom) {
        socket.send(JSON.stringify({ type: 'chat', text: "Ich habe aufgegeben!", sender: nameInput.value, room: onlineRoom }));
    }
};

document.getElementById("undoBtn").onclick = () => {
    if (history.length > 0) {
        unlockAchievement("undoKing");
        const last = JSON.parse(history.pop()); board = last.b; turn = last.t;
        addChat("System", "Zug wurde rückgängig gemacht.", "system");
        draw();
    }
};

document.getElementById("resetBtn").onclick = () => {
    addChat("System", "Ein neues Spiel wurde gestartet.", "system");
    resetGame();
};

document.getElementById("connectMP").onclick = () => {
    const id = document.getElementById("roomID").value || "global";
    addChat("System", `Verbindung zu Raum ${id} wird hergestellt...`, "system");
    socket.send(JSON.stringify({ type: 'join', room: id, name: nameInput.value || "Spieler" }));
};

gameModeSelect.onchange = () => {
    const val = gameModeSelect.value;
    if (val === "bot") addChat("System", "Bot-Modus (Stockfish) aktiviert. Viel Glück!", "system");
    if (val === "random") addChat("System", "Suche nach einem zufälligen Gegner läuft...", "system");
    if (val === "local") addChat("System", "Lokaler Modus für 2 Spieler am selben Gerät.", "system");
};

document.getElementById("send-chat").onclick = () => {
    const txt = chatInput.value.trim();
    if (txt && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'chat', text: txt, sender: nameInput.value || "Spieler", room: onlineRoom }));
        addChat("Ich", txt, "me"); chatInput.value = "";
    }
};

// --- NETZWERK ---

socket.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.type === 'move') {
        addChat("System", "Gegner hat einen Zug gemacht.", "system");
        doMove(d.move.fr, d.move.fc, d.move.tr, d.move.tc, false);
    }
    if (d.type === 'chat') addChat(d.sender, d.text, "other");
    if (d.type === 'join') { 
        onlineRoom = d.room; myColor = d.color || "white";
        (myColor === "black") ? boardEl.classList.add("flipped") : boardEl.classList.remove("flipped");
        addChat("System", `ERFOLGREICH VERBUNDEN: Du spielst ${myColor === "white" ? "Weiß" : "Schwarz"} in Raum ${d.room}.`, "system");
        resetGame();
    }
};

stockfishWorker.onmessage = (e) => {
    if (e.data && turn === "black") {
        setTimeout(() => doMove(e.data.fr, e.data.fc, e.data.tr, e.data.tc, false), 500);
    }
};

// --- START ---

function resetGame() {
    board = [
        ["r","n","b","q","k","b","n","r"], ["p","p","p","p","p","p","p","p"],
        ["","","","","","","",""], ["","","","","","","",""],
        ["","","","","","","",""], ["","","","","","","",""],
        ["P","P","P","P","P","P","P","P"], ["R","N","B","Q","K","B","N","R"]
    ];
    turn = "white"; selected = null; possibleMoves = [];
    statusEl.textContent = "Weiß am Zug";
    draw();
}

updateAchievementDisplay();
resetGame();
console.log("System geladen.");

// --- VARIABLEN ---
const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const gameModeSelect = document.getElementById("gameMode");
const nameInput = document.getElementById("playerName");
const achListEl = document.getElementById("achievement-list");

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

let board, turn = "white", selected = null, history = [], possibleMoves = [];
let myColor = "white", onlineRoom = null;

// ERFOLGE SYSTEM
let achievements = JSON.parse(localStorage.getItem('chessAchievements')) || {
    firstWin: { name: "Erster Sieg", icon: "🏆", earned: false },
    pawnMaster: { name: "Bauern-Profi", icon: "👑", earned: false },
    undoKing: { name: "Zeit-Reisender", icon: "⏳", earned: false },
    firstBlood: { name: "Erster Schlag", icon: "⚔️", earned: false }
};

function updateAchievementDisplay() {
    achListEl.innerHTML = "";
    Object.keys(achievements).forEach(id => {
        if (achievements[id].earned) {
            const s = document.createElement("span");
            s.textContent = achievements[id].icon;
            s.style.marginRight = "5px";
            achListEl.appendChild(s);
        }
    });
}

function unlockAchievement(id) {
    if (!achievements[id].earned) {
        achievements[id].earned = true;
        localStorage.setItem('chessAchievements', JSON.stringify(achievements));
        addChat("System", `ERFOLG FREIGESCHALTET: ${achievements[id].icon} ${achievements[id].name}`, "system");
        updateAchievementDisplay();
        sounds.check.play();
    }
}

// --- CHAT & SYSTEM NACHRICHTEN ---
function addChat(sender, text, type) {
    const m = document.createElement("div");
    if (type === "system") {
        m.className = "msg system-msg";
        m.innerHTML = `⚙️ ${text}`;
    } else {
        m.className = (type === 'me') ? "msg my-msg" : "msg other-msg";
        m.innerHTML = `<strong>${sender}:</strong> ${text}`;
    }
    chatMessages.appendChild(m);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- SPIEL LOGIK ---
function isOwn(p, c = turn) {
    if (!p) return false;
    return (c === "white") ? p === p.toUpperCase() : p === p.toLowerCase();
}

function canMove(fr, fc, tr, tc, b = board) {
    const p = b[fr][fc]; if (!p) return false;
    const target = b[tr][tc];
    if (target && isOwn(target, isOwn(p, "white") ? "white" : "black")) return false;
    
    const dr = Math.abs(tr - fr), dc = Math.abs(tc - fc), type = p.toLowerCase();
    
    if (type === 'p') {
        const dir = (p === 'P') ? -1 : 1;
        if (fc === tc && b[tr][tc] === "") {
            if (tr - fr === dir) return true;
            if (tr - fr === 2 * dir && (fr === 1 || fr === 6) && b[fr + dir][fc] === "") return true;
        } else if (dc === 1 && tr - fr === dir && b[tr][tc] !== "") return true;
        return false;
    }
    
    const clear = () => {
        const rD = Math.sign(tr - fr), cD = Math.sign(tc - fc);
        let r = fr + rD, c = fc + cD;
        while (r !== tr || c !== tc) { if (b[r][c] !== "") return false; r += rD; c += cD; }
        return true;
    };
    
    if (type === 'r') return (fr === tr || fc === tc) && clear();
    if (type === 'b') return dr === dc && clear();
    if (type === 'q') return (fr === tr || fc === tc || dr === dc) && clear();
    if (type === 'n') return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
    if (type === 'k') return dr <= 1 && dc <= 1;
    return false;
}

function findKing(c) {
    const t = (c === "white" ? "K" : "k");
    for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) if (board[r][col] === t) return { r, c: col };
}

function isAttacked(row, col, attColor) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) 
        if (board[r][c] && isOwn(board[r][c], attColor) && canMove(r, c, row, col)) return true;
    return false;
}

function isSafe(fr, fc, tr, tc) {
    const p = board[fr][fc], t = board[tr][tc];
    board[tr][tc] = p; board[fr][fc] = "";
    const k = findKing(turn);
    const safe = k ? !isAttacked(k.r, k.c, turn === "white" ? "black" : "white") : true;
    board[fr][fc] = p; board[tr][tc] = t;
    return safe;
}

function doMove(fr, fc, tr, tc, emit = true) {
    history.push(JSON.stringify({ b: board.map(r => [...r]), t: turn }));
    
    if (board[tr][tc] !== "") unlockAchievement("firstBlood");
    
    board[tr][tc] = board[fr][fc]; board[fr][fc] = "";
    
    // Umwandlung
    if (board[tr][tc] === 'P' && tr === 0) { board[tr][tc] = 'Q'; unlockAchievement("pawnMaster"); }
    if (board[tr][tc] === 'p' && tr === 7) { board[tr][tc] = 'q'; unlockAchievement("pawnMaster"); }
    
    if (emit && socket.readyState === 1 && (gameModeSelect.value === "online" || gameModeSelect.value === "random")) {
        socket.send(JSON.stringify({ type: 'move', move: { fr, fc, tr, tc }, room: onlineRoom }));
    }
    
    turn = (turn === "white" ? "black" : "white");
    const k = findKing(turn), inCheck = isAttacked(k.r, k.c, turn === "white" ? "black" : "white");
    if (inCheck) sounds.check.play(); else sounds.move.play();
    
    // Check Matt/Patt
    let moves = 0;
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) 
        if(board[r][c] && isOwn(board[r][c])) 
            for(let tr2=0; tr2<8; tr2++) for(let tc2=0; tc2<8; tc2++) 
                if(canMove(r, c, tr2, tc2) && isSafe(r, c, tr2, tc2)) moves++;
    
    if (moves === 0) {
        if (inCheck) {
            const w = (turn === "white" ? "Schwarz" : "Weiß");
            statusEl.textContent = "MATT! " + w + " GEWINNT!";
            if(w === "Weiß" && myColor === "white") unlockAchievement("firstWin");
        } else statusEl.textContent = "PATT! Unentschieden.";
    } else {
        statusEl.textContent = (turn === "white" ? "Weiß" : "Schwarz") + (inCheck ? " steht im Schach!" : " am Zug");
    }
    
    selected = null; possibleMoves = [];
    draw();
    if (turn === "black" && gameModeSelect.value === "bot") stockfishWorker.postMessage({ board, turn: "black" });
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
            if (inCheck && board[r][c] && board[r][c].toLowerCase() === 'k' && isOwn(board[r][c])) sq.classList.add("in-check");
            
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
                    if (canMove(selected.r, selected.c, r, c) && isSafe(selected.r, selected.c, r, c)) {
                        doMove(selected.r, selected.c, r, c);
                    } else {
                        selected = (board[r][c] && isOwn(board[r][c])) ? { r, c } : null;
                        possibleMoves = selected ? [] : [];
                        if (selected) {
                            for (let tr = 0; tr < 8; tr++) for (let tc = 0; tc < 8; tc++) 
                                if (canMove(selected.r, selected.c, tr, tc) && isSafe(selected.r, selected.c, tr, tc)) 
                                    possibleMoves.push({ tr, tc });
                        }
                        draw();
                    }
                } else if (board[r][c] && isOwn(board[r][c])) {
                    selected = { r, c };
                    possibleMoves = [];
                    for (let tr = 0; tr < 8; tr++) for (let tc = 0; tc < 8; tc++) 
                        if (canMove(r, c, tr, tc) && isSafe(r, c, tr, tc)) 
                            possibleMoves.push({ tr, tc });
                    draw();
                }
            };
            boardEl.appendChild(sq);
        }
    }
    updateBoardColors();
}

// FARBEN
const cpW = document.getElementById("colorWhite"), cpB = document.getElementById("colorBlack");
function updateBoardColors() {
    document.querySelectorAll(".white-sq").forEach(s => s.style.backgroundColor = cpW.value);
    document.querySelectorAll(".black-sq").forEach(s => s.style.backgroundColor = cpB.value);
}
cpW.oninput = updateBoardColors; cpB.oninput = updateBoardColors;

// EVENTS
document.getElementById("undoBtn").onclick = () => {
    if (history.length > 0) {
        unlockAchievement("undoKing");
        const last = JSON.parse(history.pop()); board = last.b; turn = last.t;
        if (gameModeSelect.value === "bot" && history.length > 0) {
            const p = JSON.parse(history.pop()); board = p.b; turn = p.t;
        }
        draw();
    }
};

document.getElementById("resetBtn").onclick = () => { boardEl.classList.remove("flipped"); resetGame(); };

document.getElementById("connectMP").onclick = () => {
    socket.send(JSON.stringify({ type: 'join', room: document.getElementById("roomID").value || "global", name: nameInput.value }));
};

document.getElementById("send-chat").onclick = () => {
    const t = chatInput.value;
    if (t && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'chat', text: t, sender: nameInput.value || "Spieler", room: onlineRoom }));
        addChat("Ich", t, "me"); chatInput.value = "";
    }
};

socket.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.type === 'move') doMove(d.move.fr, d.move.fc, d.move.tr, d.move.tc, false);
    if (d.type === 'chat') addChat(d.sender, d.text, "other");
    if (d.type === 'join') { 
        onlineRoom = d.room; myColor = d.color || "white";
        (myColor === "black") ? boardEl.classList.add("flipped") : boardEl.classList.remove("flipped");
        addChat("System", `Raum ${d.room} beigetreten als ${myColor === "white" ? "Weiß" : "Schwarz"}`, "system");
        resetGame();
    }
};

stockfishWorker.onmessage = (e) => { if(e.data && turn === "black") setTimeout(() => doMove(e.data.fr, e.data.fc, e.data.tr, e.data.tc, false), 500); };

function resetGame() {
    board = [["r","n","b","q","k","b","n","r"],["p","p","p","p","p","p","p","p"],["","","","","","","",""],["","","","","","","",""],["","","","","","","",""],["","","","","","","",""],["P","P","P","P","P","P","P","P"],["R","N","B","Q","K","B","N","R"]];
    turn = "white"; statusEl.textContent = "Weiß am Zug"; draw();
}

updateAchievementDisplay();
resetGame();

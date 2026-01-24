const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const gameModeSelect = document.getElementById("gameMode");
const nameInput = document.getElementById("playerName");
const cpW = document.getElementById("colorWhite");
const cpB = document.getElementById("colorBlack");

// --- 1. KONFIGURATION ---
let stockfishWorker = new Worker('engineWorker.js'); 
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

let board, turn = "white", selected = null, history = [];
let myColor = "white", onlineRoom = null;

// --- 2. HILFSFUNKTIONEN ---
function isOwn(p, c = turn) { return p && (c === "white" ? p === p.toUpperCase() : p === p.toLowerCase()); }

function addChat(sender, text, type) {
    const m = document.createElement("div");
    m.className = `msg ${type === 'me' ? 'my-msg' : (type === 'system' ? 'system-msg' : 'other-msg')}`;
    m.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chatMessages.appendChild(m);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- 3. LOGIK ---
function canMoveLogic(fr, fc, tr, tc, b = board) {
    const p = b[fr][fc]; if(!p) return false;
    const target = b[tr][tc]; if(target && isOwn(target, isOwn(p, "white") ? "white" : "black")) return false;
    const dr = Math.abs(tr - fr), dc = Math.abs(tc - fc), type = p.toLowerCase();
    
    if(type === 'p') {
        const dir = (p === 'P') ? -1 : 1;
        if(fc === tc && b[tr][tc] === "") {
            if(tr - fr === dir) return true;
            if(tr - fr === 2*dir && (fr === 1 || fr === 6) && b[fr+dir][fc] === "") return true;
        } else if(dc === 1 && tr - fr === dir && b[tr][tc] !== "") return true;
        return false;
    }
    const pathClear = () => {
        const rD = Math.sign(tr - fr), cD = Math.sign(tc - fc);
        let r = fr + rD, c = fc + cD;
        while(r !== tr || c !== tc) { if(b[r][c] !== "") return false; r += rD; c += cD; }
        return true;
    };
    if(type === 'r') return (fr === tr || fc === tc) && pathClear();
    if(type === 'b') return dr === dc && pathClear();
    if(type === 'q') return (fr === tr || fc === tc || dr === dc) && pathClear();
    if(type === 'n') return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
    if(type === 'k') return dr <= 1 && dc <= 1;
    return false;
}

function findKing(c) {
    const t = (c === "white" ? "K" : "k");
    for(let r=0; r<8; r++) for(let col=0; col<8; col++) if(board[r][col] === t) return {r, c: col};
    return null;
}

function isAttacked(tr, tc, attackerColor) {
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) 
        if(board[r][c] && isOwn(board[r][c], attackerColor) && canMoveLogic(r, c, tr, tc)) return true;
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

function doMove(fr, fc, tr, tc, emit = true) {
    history.push(JSON.stringify({ b: board.map(row => [...row]), t: turn }));
    
    let piece = board[fr][fc];
    board[tr][tc] = piece;
    board[fr][fc] = "";

    // BAUERNUMWANDLUNG
    if(piece === 'P' && tr === 0) {
        let choice = prompt("Umwandlung: Q (Dame), R (Turm), B (Läufer), N (Springer)", "Q") || "Q";
        board[tr][tc] = choice.toUpperCase()[0];
    }
    if(piece === 'p' && tr === 7) {
        let choice = prompt("Umwandlung: q (Dame), r (Turm), b (Läufer), n (Springer)", "q") || "q";
        board[tr][tc] = choice.toLowerCase()[0];
    }

    if (emit && socket.readyState === 1 && onlineRoom) {
        socket.send(JSON.stringify({ type: 'move', move: {fr, fc, tr, tc}, room: onlineRoom }));
    }

    turn = (turn === "white" ? "black" : "white");
    sounds.move.play();
    statusEl.textContent = (turn === "white" ? "Weiß" : "Schwarz") + " am Zug";
    draw();
}

// --- 4. DARSTELLUNG ---
function draw() {
    boardEl.innerHTML = "";
    board.forEach((row, r) => {
        row.forEach((p, c) => {
            const d = document.createElement("div");
            d.className = "square";
            d.style.backgroundColor = (r + c) % 2 ? cpB.value : cpW.value;

            if(selected && selected.r === r && selected.c === c) d.classList.add("selected");

            // ZUG-VORSCHAU (PUNKTE)
            if(selected && canMoveLogic(selected.r, selected.c, r, c) && isSafeMove(selected.r, selected.c, r, c)) {
                const dot = document.createElement("div");
                dot.className = "move-hint";
                d.appendChild(dot);
            }

            if(p) {
                const img = document.createElement("img"); img.src = PIECES[p];
                img.style.width = "85%"; d.appendChild(img);
            }
            
            d.onclick = () => {
                if(selected) {
                    if(canMoveLogic(selected.r, selected.c, r, c) && isSafeMove(selected.r, selected.c, r, c)) {
                        doMove(selected.r, selected.c, r, c);
                        selected = null;
                    } else {
                        selected = (board[r][c] && isOwn(board[r][c])) ? {r, c} : null;
                    }
                } else if(board[r][c] && isOwn(board[r][c])) {
                    selected = {r, c};
                }
                draw();
            };
            boardEl.appendChild(d);
        });
    });
}

function resetGame() {
    board = [
        ["r","n","b","q","k","b","n","r"], ["p","p","p","p","p","p","p","p"],
        ["","","","","","","",""], ["","","","","","","",""],
        ["","","","","","","",""], ["","","","","","","",""],
        ["P","P","P","P","P","P","P","P"], ["R","N","B","Q","K","B","N","R"]
    ];
    turn = "white"; selected = null; history = []; draw();
}

// --- 5. EVENTS ---
cpW.oninput = draw;
cpB.oninput = draw;

document.getElementById("undoBtn").onclick = () => {
    if (history.length > 0) {
        const lastState = JSON.parse(history.pop());
        board = lastState.b; turn = lastState.t; selected = null; draw();
        statusEl.textContent = (turn === "white" ? "Weiß" : "Schwarz") + " am Zug";
    }
};

document.getElementById("resetBtn").onclick = resetGame;
document.getElementById("send-chat").onclick = () => {
    const t = chatInput.value.trim();
    if(t && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'chat', text: t, sender: nameInput.value || "Anonym", room: onlineRoom }));
        addChat("Ich", t, "me"); chatInput.value = "";
    }
};

socket.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if(d.type === 'chat') addChat(d.sender, d.text, "other");
    if(d.type === 'move') doMove(d.move.fr, d.move.fc, d.move.tr, d.move.tc, false);
    if(d.type === 'leaderboard') {
        document.getElementById("leaderboard-list").innerHTML = d.list.map(p => `<div>${p.name}: ${p.wins} 🏆</div>`).join('');
    }
};

resetGame();

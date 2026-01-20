// 1. Verbindung zum neuen WebSocket-Server auf Render
const socket = new WebSocket("wss://mein-schach-vo91.onrender.com");

const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-chat");

// Sounds
const moveSound = new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/move-self.mp3');
const captureSound = new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/capture.mp3');
const checkSound = new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/move-check.mp3');

function playSnd(s) { s.play().catch(() => {}); }

const PIECE_URLS = {
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg', 'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg', 'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qdt45.svg', 'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg', 'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg', 'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg', 'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg'
};

let board, turn = "white", selected = null, history = [];
let myColor = "white"; // Standardmäßig weiß, wird bei Match-Suche angepasst

// --- NEUE WEBSOCKET LOGIK ---
socket.onopen = () => {
    console.log("Verbunden mit dem Server!");
    // Beitritt zum globalen Raum für den Chat
    socket.send(JSON.stringify({ type: 'join', room: 'global', name: 'Spieler' }));
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // Wenn ein Gegner gefunden wurde
    if (data.type === 'match_found') {
        alert("Gegner gefunden! Du spielst: " + (data.color === 'white' ? "Weiß" : "Schwarz"));
        myColor = data.color;
        resetGame();
    }

    // Wenn eine Chat-Nachricht ankommt
    if (data.type === 'global_chat' || data.type === 'chat') {
        addChat(data.sender || "Gegner", data.text, "other");
    }

    // Wenn der Gegner einen Zug macht
    if (data.type === 'move') {
        const m = data.move;
        doMove(m.fr, m.fc, m.tr, m.tc, false); // false = nicht nochmal senden
    }
};

// Hilfsfunktion für den Chat-Verlauf
function addChat(sender, text, type) {
    if (!chatMessages) return;
    const m = document.createElement("div");
    m.className = `msg ${type === 'me' ? 'my-msg' : 'other-msg'}`;
    m.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chatMessages.appendChild(m);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendMessage() {
    const text = chatInput.value.trim();
    if (text !== "" && socket.readyState === WebSocket.OPEN) {
        // Senden an den Server (für alle im Welt-Chat)
        socket.send(JSON.stringify({
            type: 'global_chat',
            sender: 'Ich',
            text: text
        }));
        addChat("Du", text, "me");
        chatInput.value = "";
    }
}

if(sendBtn) sendBtn.onclick = sendMessage;
if(chatInput) chatInput.onkeydown = (e) => { if (e.key === "Enter") sendMessage(); };

// Funktion um die Gegnersuche zu starten
function findOpponent() {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'find_random', name: 'Spieler' }));
        statusEl.textContent = "Suche Gegner...";
    }
}

// --- DEINE BEWÄHRTE SCHACH LOGIK ---
function resetGame() {
    board = [
        ["r","n","b","q","k","b","n","r"], ["p","p","p","p","p","p","p","p"],
        ["","","","","","","",""], ["","","","","","","",""],
        ["","","","","","","",""], ["","","","","","","",""],
        ["P","P","P","P","P","P","P","P"], ["R","N","B","Q","K","B","N","R"]
    ];
    turn = "white"; selected = null; history = [];
    statusEl.style.color = "white";
    draw();
}

function isOwn(p, c = turn) { return p && (c === "white" ? p === p.toUpperCase() : p === p.toLowerCase()); }

function canMoveLogic(fr, fc, tr, tc, b = board) {
    const p = b[fr][fc]; if(!p) return false;
    const target = b[tr][tc]; 
    if(target && isOwn(target, isOwn(p, "white") ? "white" : "black")) return false;
    
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

function findKing(c, b = board) {
    const t = (c === "white" ? "K" : "k");
    for(let r=0; r<8; r++) for(let cIdx=0; cIdx<8; cIdx++) if(b[r][cIdx] === t) return {r, c: cIdx};
    return {r:0, c:0};
}

function isAttacked(tr, tc, attackerColor, b = board) {
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) 
        if(b[r][c] && isOwn(b[r][c], attackerColor) && canMoveLogic(r, c, tr, tc, b)) return true;
    return false;
}

function canMove(fr, fc, tr, tc) {
    if(!canMoveLogic(fr, fc, tr, tc)) return false;
    const piece = board[fr][fc];
    const target = board[tr][tc];
    board[tr][tc] = piece; board[fr][fc] = "";
    const color = isOwn(piece, "white") ? "white" : "black";
    const k = findKing(color);
    const inCheckAfter = isAttacked(k.r, k.c, color === "white" ? "black" : "white");
    board[fr][fc] = piece; board[tr][tc] = target;
    return !inCheckAfter;
}

function hasAnyLegalMove(color) {
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) {
        if(board[r][c] && isOwn(board[r][c], color)) {
            for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) {
                if(canMove(r, c, tr, tc)) return true;
            }
        }
    }
    return false;
}

function doMove(fr, fc, tr, tc, emit = true) {
    history.push({ board: JSON.parse(JSON.stringify(board)), turn });
    const isCapture = board[tr][tc] !== "";
    board[tr][tc] = board[fr][fc]; board[fr][fc] = "";
    
    if(board[tr][tc] === 'P' && tr === 0) board[tr][tc] = 'Q';
    if(board[tr][tc] === 'p' && tr === 7) board[tr][tc] = 'q';

    // NEU: Sende den Zug an den Gegner über den Server
    if (emit && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'move',
            move: {fr, fc, tr, tc}
        }));
    }

    turn = (turn === "white" ? "black" : "white");
    draw();

    const k = findKing(turn);
    const inCheck = isAttacked(k.r, k.c, turn === "white" ? "black" : "white");
    const movesLeft = hasAnyLegalMove(turn);

    if (inCheck) {
        if (!movesLeft) {
            statusEl.textContent = "SCHACHMATT! " + (turn === "white" ? "Schwarz" : "Weiß") + " gewinnt!";
            statusEl.style.color = "#ff4d4d";
            playSnd(checkSound);
        } else {
            statusEl.textContent = "SCHACH!";
            playSnd(checkSound);
        }
    } else {
        if (!movesLeft) {
            statusEl.textContent = "PATT (Remis)!";
        } else {
            statusEl.style.color = "white";
            isCapture ? playSnd(captureSound) : playSnd(moveSound);
        }
    }
}

function draw() {
    boardEl.innerHTML = "";
    const k = findKing(turn);
    const check = isAttacked(k.r, k.c, turn === "white" ? "black" : "white");

    board.forEach((row, r) => {
        row.forEach((p, c) => {
            const d = document.createElement("div");
            d.className = `square ${(r + c) % 2 ? "black-sq" : "white-sq"}`;
            if(selected && selected.r === r && selected.c === c) d.classList.add("selected");
            if(check && k.r === r && k.c === c) d.style.backgroundColor = "rgba(255, 0, 0, 0.6)";
            
            if(p) {
                const img = document.createElement("img"); img.src = PIECE_URLS[p];
                img.style.width = "85%"; d.appendChild(img);
            }
            d.onclick = () => {
                // Man kann nur ziehen, wenn man dran ist (turn === myColor)
                if(selected) {
                    if(canMove(selected.r, selected.c, r, c)) { doMove(selected.r, selected.c, r, c); selected = null; }
                    else { selected = (board[r][c] && isOwn(board[r][c])) ? {r, c} : null; }
                } else if(board[r][c] && isOwn(board[r][c])) { selected = {r, c}; }
                draw();
            };
            boardEl.appendChild(d);
        });
    });
    if(!statusEl.textContent.includes("MATT") && !statusEl.textContent.includes("PATT") && !statusEl.textContent.includes("SCHACH!")) {
        statusEl.textContent = (turn === "white" ? "Weiß am Zug" : "Schwarz am Zug");
    }
}

document.getElementById("undoBtn").onclick = () => {
    if(history.length > 0) { 
        const last = history.pop(); 
        board = last.board; turn = last.turn; 
        selected = null; statusEl.style.color = "white"; 
        draw(); 
    }
};
document.getElementById("resetBtn").onclick = resetGame;
resetGame();

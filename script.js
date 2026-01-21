const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-chat");
const gameModeSelect = document.getElementById("gameMode");
const leaderboardList = document.getElementById("leaderboard-list");

// --- 1. VERBINDUNGEN ---
const socket = new WebSocket("wss://mein-schach-vo91.onrender.com");
let stockfishWorker = new Worker('engineWorker.js'); 

const PIECE_URLS = {
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg', 'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg', 'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg', 'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg', 'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg', 'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg', 'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg'
};

let board, turn = "white", selected = null, history = [];

// --- 2. BOT LOGIK ---
stockfishWorker.onmessage = function(e) {
    const move = e.data;
    if (move && turn === "black") {
        setTimeout(() => { doMove(move.fr, move.fc, move.tr, move.tc, false); }, 600);
    }
};

function triggerBot() {
    if (gameModeSelect.value === "bot" && turn === "black") {
        stockfishWorker.postMessage({ board: board, turn: "black" });
    }
}

// --- 3. SERVER & CHAT LOGIK ---
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    // Züge empfangen (nur im Online-Modus)
    if (data.type === 'move' && gameModeSelect.value === "online") {
        doMove(data.move.fr, data.move.fc, data.move.tr, data.move.tc, false);
    }
    
    // Chat Nachrichten (Normal & Global)
    if (data.type === 'chat' || data.type === 'global_chat') {
        addChat(data.sender || "Gegner", data.text, "other");
    }
    
    // Spieler-Anzahl Update
    if (data.type === 'user-count') {
        document.getElementById("user-counter").textContent = "Online: " + data.count;
    }

    // Leaderboard Daten
    if (data.type === 'leaderboard') {
        updateLeaderboard(data.list);
    }
};

// --- HIER SIND DIE SYSTEM-NACHRICHTEN ---
function addChat(sender, text, type) {
    if (!chatMessages) return;
    const m = document.createElement("div");
    
    // Wenn der Sender "System" ist, stylen wir es anders (kursiv/grau)
    if (sender === "System") {
        m.className = "msg other-msg";
        m.style.color = "#aaa"; // Grau für System
        m.innerHTML = `<i><strong>${sender}:</strong> ${text}</i>`;
    } else {
        m.className = `msg ${type === 'me' ? 'my-msg' : 'other-msg'}`;
        m.innerHTML = `<strong>${sender}:</strong> ${text}`;
    }
    
    chatMessages.appendChild(m);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateLeaderboard(list) {
    if (!leaderboardList) return;
    leaderboardList.innerHTML = list.map((player, i) => 
        `<div>${i+1}. ${player.name} (${player.wins} Siege)</div>`
    ).join('');
}

function sendMessage() {
    const text = chatInput.value.trim();
    if (text !== "" && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'chat', text: text, sender: 'WeltGast' }));
        addChat("Du", text, "me");
        chatInput.value = "";
    }
}

sendBtn.onclick = sendMessage;
chatInput.onkeydown = (e) => { if (e.key === "Enter") sendMessage(); };

// --- VERBINDUNGSMELDUNGEN ---
document.getElementById("connectMP").onclick = () => {
    const room = document.getElementById("roomID").value || "global";
    
    if(socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'join', room: room, name: 'WeltGast' }));
        
        // Sofortige Bestätigung im Chat anzeigen
        addChat("System", `Verbindung wird aufgebaut...`, "other");
        addChat("System", `Du bist jetzt im Raum: ${room}`, "other");
        addChat("System", `Suche nach einem Gegner...`, "other");
        
        statusEl.textContent = "Warte auf Gegner...";
    } else {
        addChat("System", "Fehler: Keine Verbindung zum Server!", "other");
    }
};

// --- 4. SCHACH LOGIK (Gekürzt auf das Wichtigste) ---
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
    if(type === 'r' && (fr === tr || fc === tc)) return pathClear();
    if(type === 'b' && dr === dc) return pathClear();
    if(type === 'q' && (fr === tr || fc === tc || dr === dc)) return pathClear();
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
    const p = board[fr][fc], t = board[tr][tc];
    board[tr][tc] = p; board[fr][fc] = "";
    const color = isOwn(p, "white") ? "white" : "black";
    const k = findKing(color);
    const safe = !isAttacked(k.r, k.c, color === "white" ? "black" : "white");
    board[fr][fc] = p; board[tr][tc] = t;
    return safe;
}

function hasLegalMoves(color) {
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) {
        if(board[r][c] && isOwn(board[r][c], color)) {
            for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) if(canMove(r, c, tr, tc)) return true;
        }
    }
    return false;
}

function doMove(fr, fc, tr, tc, emit = true) {
    history.push({ board: JSON.parse(JSON.stringify(board)), turn });
    board[tr][tc] = board[fr][fc]; board[fr][fc] = "";
    if(board[tr][tc] === 'P' && tr === 0) board[tr][tc] = 'Q';
    if(board[tr][tc] === 'p' && tr === 7) board[tr][tc] = 'q';

    if (emit && gameModeSelect.value === "online" && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'move', move: {fr, fc, tr, tc} }));
    }

    turn = (turn === "white" ? "black" : "white");
    const k = findKing(turn);
    const inCheck = isAttacked(k.r, k.c, turn === "white" ? "black" : "white");
    const moves = hasLegalMoves(turn);

    if (inCheck) {
        statusEl.textContent = moves ? "SCHACH!" : "SCHACHMATT!";
        if(!moves) statusEl.style.color = "red";
    } else {
        statusEl.textContent = moves ? (turn === "white" ? "Weiß am Zug" : "Schwarz am Zug") : "PATT!";
        statusEl.style.color = "white";
    }
    draw();
    if (turn === "black") triggerBot();
}

function draw() {
    boardEl.innerHTML = "";
    board.forEach((row, r) => {
        row.forEach((p, c) => {
            const d = document.createElement("div");
            d.className = `square ${(r + c) % 2 ? "black-sq" : "white-sq"}`;
            if(selected && selected.r === r && selected.c === c) d.classList.add("selected");
            if(p) {
                const img = document.createElement("img"); img.src = PIECE_URLS[p];
                img.style.width = "85%"; d.appendChild(img);
            }
            d.onclick = () => {
                if(selected) {
                    if(canMove(selected.r, selected.c, r, c)) { doMove(selected.r, selected.c, r, c); selected = null; }
                    else { selected = (board[r][c] && isOwn(board[r][c])) ? {r, c} : null; }
                } else if(board[r][c] && isOwn(board[r][c])) { selected = {r, c}; }
                draw();
            };
            boardEl.appendChild(d);
        });
    });
}

document.getElementById("undoBtn").onclick = () => {
    if(history.length > 0) { 
        const last = history.pop(); board = last.board; turn = last.turn; 
        selected = null; draw(); 
    }
};
document.getElementById("resetBtn").onclick = resetGame;
resetGame();

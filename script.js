const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const gameModeSelect = document.getElementById("gameMode");
const nameInput = document.getElementById("playerName");
const leaderboardEl = document.getElementById("leaderboard-list");

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

function getMyName() { 
    return nameInput.value.trim() || "Spieler_" + Math.floor(Math.random()*999); 
}

// --- 2. CHAT & SYSTEM-NACHRICHTEN ---
function addChat(sender, text, type) {
    const m = document.createElement("div");
    m.className = type === "system" ? "msg system-msg" : `msg ${type === 'me' ? 'my-msg' : 'other-msg'}`;
    m.innerHTML = type === "system" ? `⚙️ ${text}` : `<strong>${sender}:</strong> ${text}`;
    chatMessages.appendChild(m);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Emojis hinzufügen
document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.onclick = () => { chatInput.value += btn.textContent; chatInput.focus(); };
});

function sendMsg() {
    const t = chatInput.value.trim();
    if (t && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'chat', text: t, sender: getMyName(), room: onlineRoom }));
        addChat("Ich", t, "me"); chatInput.value = "";
    }
}
document.getElementById("send-chat").onclick = sendMsg;
chatInput.onkeydown = (e) => { if(e.key === "Enter") sendMsg(); };

// --- 3. SERVER LOGIK (LEADERBOARD & EVENTS) ---
socket.onmessage = (e) => {
    const d = JSON.parse(e.data);
    switch(d.type) {
        case 'join':
            onlineRoom = d.room;
            document.getElementById("roomID").value = d.room;
            myColor = d.color || "white";
            myColor === "black" ? boardEl.classList.add("flipped") : boardEl.classList.remove("flipped");
            addChat("System", `Gegner gefunden! Raum: ${d.room}. Du spielst ${myColor === "white"?"Weiß":"Schwarz"}.`, "system");
            resetGame();
            break;
        case 'move':
            doMove(d.move.fr, d.move.fc, d.move.tr, d.move.tc, false);
            break;
        case 'chat':
            addChat(d.sender, d.text, "other");
            break;
        case 'user-count':
            document.getElementById("user-counter").textContent = "Online: " + d.count + " ● Live";
            break;
        case 'leaderboard':
            if (leaderboardEl) {
                leaderboardEl.innerHTML = d.list.map((p, i) => 
                    `<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.05)">
                        <span>${i+1}. ${p.name}</span>
                        <span style="color:#f1c40f">${p.wins} 🏆</span>
                    </div>`).join('');
            }
            break;
    }
};

// --- 4. SCHACH LOGIK (KOMPLETT) ---
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

// --- 5. GAME OVER & SIEGE ---
function checkGameOver() {
    let moves = 0;
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) 
        if(board[r][c] && isOwn(board[r][c])) 
            for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) 
                if(canMoveLogic(r, c, tr, tc) && isSafeMove(r, c, tr, tc)) moves++;

    if(moves === 0) {
        const k = findKing(turn), inCheck = isAttacked(k.r, k.c, turn === "white" ? "black" : "white");
        if(inCheck) {
            const winner = turn === "white" ? "Schwarz" : "Weiß";
            statusEl.textContent = `MATT! ${winner} GEWINNT!`;
            addChat("System", `SCHACHMATT! ${winner} hat gewonnen!`, "system");
            
            // Siegmeldung an den Server
            if(socket.readyState === 1 && (gameModeSelect.value === "online" || gameModeSelect.value === "random")) {
                if((winner === "Weiß" && myColor === "white") || (winner === "Schwarz" && myColor === "black")) {
                    socket.send(JSON.stringify({ type: 'win', playerName: getMyName() }));
                }
            }
        } else {
            statusEl.textContent = "PATT!";
            addChat("System", "Unentschieden durch Patt.", "system");
        }
        return true;
    }
    return false;
}

// --- 6. SPIELZÜGE & HISTORY ---
function doMove(fr, fc, tr, tc, emit = true) {
    // HISTORY SPEICHERN (Für Zurücktaste)
    history.push(JSON.stringify({ b: board.map(row => [...row]), t: turn }));

    const isCap = board[tr][tc] !== "";
    board[tr][tc] = board[fr][fc]; board[fr][fc] = "";
    
    // Umwandlung
    if(board[tr][tc] === 'P' && tr === 0) board[tr][tc] = 'Q';
    if(board[tr][tc] === 'p' && tr === 7) board[tr][tc] = 'q';

    if (emit && socket.readyState === 1 && (gameModeSelect.value === "online" || gameModeSelect.value === "random")) {
        socket.send(JSON.stringify({ type: 'move', move: {fr, fc, tr, tc}, room: onlineRoom }));
    }

    turn = (turn === "white" ? "black" : "white");
    const k = findKing(turn), inCheck = isAttacked(k.r, k.c, turn === "white" ? "black" : "white");
    
    if(inCheck) sounds.check.play(); else if(isCap) sounds.cap.play(); else sounds.move.play();
    
    if(!checkGameOver()) {
        statusEl.textContent = (turn === "white" ? "Weiß" : "Schwarz") + (inCheck ? " steht im SCHACH!" : " am Zug");
    }
    draw();

    if(turn === "black" && gameModeSelect.value === "bot") {
        stockfishWorker.postMessage({ board, turn: "black" });
    }
}

// --- 7. BUTTONS & STEUERUNG ---
document.getElementById("undoBtn").onclick = () => {
    if (history.length > 0) {
        const last = JSON.parse(history.pop());
        board = last.b;
        turn = last.t;
        selected = null;
        addChat("System", "Zug rückgängig gemacht. ↩️", "system");
        draw();
    } else {
        addChat("System", "Keine Züge zum Rückgängig machen.", "system");
    }
};

document.getElementById("resetBtn").onclick = () => {
    addChat("System", "Spiel wurde neu gestartet.", "system");
    resetGame();
};

document.getElementById("resignBtn").onclick = () => {
    addChat("System", "Du hast das Spiel aufgegeben. 🚩", "system");
    resetGame();
};

document.getElementById("connectMP").onclick = () => {
    const r = document.getElementById("roomID").value || "global";
    addChat("System", `Suche/Verbinde zu Raum ${r}...`, "system");
    socket.send(JSON.stringify({ type: 'join', room: r, name: getMyName() }));
};

gameModeSelect.onchange = () => {
    if(gameModeSelect.value === "random") {
        addChat("System", "Suche läuft... 🎲", "system");
        socket.send(JSON.stringify({ type: 'find_random', name: getMyName() }));
    } else if(gameModeSelect.value === "bot") {
        addChat("System", "Bot-Modus aktiviert.", "system");
    }
};

// --- 8. DARSTELLUNG ---
function draw() {
    boardEl.innerHTML = "";
    board.forEach((row, r) => {
        row.forEach((p, c) => {
            const d = document.createElement("div");
            d.className = `square ${(r + c) % 2 ? "black-sq" : "white-sq"}`;
            if(selected && selected.r === r && selected.c === c) d.classList.add("selected");
            if(p) {
                const img = document.createElement("img"); img.src = PIECES[p];
                img.style.width = "85%"; d.appendChild(img);
            }
            d.onclick = () => {
                const isOnline = (gameModeSelect.value === "online" || gameModeSelect.value === "random");
                if(isOnline && turn !== myColor) return;

                if(selected) {
                    if(canMoveLogic(selected.r, selected.c, r, c) && isSafeMove(selected.r, selected.c, r, c)) {
                        doMove(selected.r, selected.c, r, c);
                        selected = null;
                    } else {
                        selected = (board[r][c] && isOwn(board[r][c])) ? {r, c} : null;
                    }
                } else if(board[r][c] && isOwn(board[r][c])) {
                    if(isOnline && !isOwn(board[r][c], myColor)) return;
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
    turn = "white"; selected = null; history = [];
    statusEl.textContent = "Weiß am Zug";
    draw();
}

stockfishWorker.onmessage = (e) => {
    if(e.data && turn === "black") setTimeout(() => doMove(e.data.fr, e.data.fc, e.data.tr, e.data.tc, false), 600);
};

// Start
resetGame();

const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const gameModeSelect = document.getElementById("gameMode");
const nameInput = document.getElementById("playerName");
const achListEl = document.getElementById("achievement-list");

// --- CONFIG & STATE ---
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

let board, turn = "white", selected = null, history = [], possibleMoves = [];
let myColor = "white", onlineRoom = null;

// ERFOLGE SYSTEM (LocalStorage)
let achievements = JSON.parse(localStorage.getItem('chessAchievements')) || {
    firstWin: { name: "Erster Sieg", icon: "🏆", earned: false },
    pawnMaster: { name: "Bauern-Profi", icon: "👑", earned: false },
    undoKing: { name: "Zeit-Reisender", icon: "⏳", earned: false },
    firstBlood: { name: "Erster Schlag", icon: "⚔️", earned: false }
};

function saveAchievements() {
    localStorage.setItem('chessAchievements', JSON.stringify(achievements));
    updateAchievementUI();
}

function updateAchievementUI() {
    achListEl.innerHTML = Object.values(achievements)
        .filter(a => a.earned).map(a => a.icon).join(" ");
}

function unlockAchievement(id) {
    if (!achievements[id].earned) {
        achievements[id].earned = true;
        saveAchievements();
        addChat("System", `ERFOLG FREIGESCHALTET: ${achievements[id].icon} ${achievements[id].name}`, "system");
        sounds.check.play(); 
    }
}

function getMyName() { return nameInput.value.trim() || "Spieler_" + Math.floor(Math.random()*999); }

// --- CORE FUNCTIONS ---
function addChat(sender, text, type) {
    const m = document.createElement("div");
    m.className = type === "system" ? "msg system-msg" : `msg ${type === 'me' ? 'my-msg' : 'other-msg'}`;
    m.innerHTML = type === "system" ? `⚙️ ${text}` : `<strong>${sender}:</strong> ${text}`;
    chatMessages.appendChild(m);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

socket.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if(d.type === 'move') doMove(d.move.fr, d.move.fc, d.move.tr, d.move.tc, false);
    if(d.type === 'chat') addChat(d.sender, d.text, "other");
    if(d.type === 'join') { onlineRoom = d.room; if(d.color) myColor = d.color; resetGame(); }
    if(d.type === 'user-count') document.getElementById("user-counter").textContent = "Online: " + d.count;
    if(d.type === 'leaderboard') document.getElementById("leaderboard-list").innerHTML = d.list.map(p => `<div>${p.name}: ${p.wins} 🏆</div>`).join('');
};

function sendMsg() {
    const t = chatInput.value.trim();
    if(t && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'chat', text: t, sender: getMyName(), room: onlineRoom }));
        addChat("Ich", t, "me"); chatInput.value = "";
    }
}
document.getElementById("send-chat").onclick = sendMsg;

// --- CHESS LOGIC ---
function isOwn(p, c = turn) { return p && (c === "white" ? p === p.toUpperCase() : p === p.toLowerCase()); }

function canMoveLogic(fr, fc, tr, tc, b = board) {
    const p = b[fr][fc]; if(!p) return false;
    const target = b[tr][tc]; if(target && isOwn(target, isOwn(p, "white")?"white":"black")) return false;
    const dr = Math.abs(tr-fr), dc = Math.abs(tc-fc), type = p.toLowerCase();
    
    if(type === 'p') {
        const dir = (p === 'P') ? -1 : 1;
        if(fc === tc && b[tr][tc] === "") {
            if(tr-fr === dir) return true;
            if(tr-fr === 2*dir && (fr === 1 || fr === 6) && b[fr+dir][fc] === "") return true;
        } else if(dc === 1 && tr-fr === dir && b[tr][tc] !== "") return true;
        return false;
    }
    const pathClear = () => {
        const rD = Math.sign(tr-fr), cD = Math.sign(tc-fc);
        let r = fr+rD, c = fc+cD;
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

function isAttacked(tr, tc, attColor) {
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) 
        if(board[r][c] && isOwn(board[r][c], attColor) && canMoveLogic(r, c, tr, tc)) return true;
    return false;
}

function isSafeMove(fr, fc, tr, tc) {
    const p = board[fr][fc], t = board[tr][tc];
    board[tr][tc] = p; board[fr][fc] = "";
    const k = findKing(turn);
    const safe = k ? !isAttacked(k.r, k.c, turn === "white"?"black":"white") : true;
    board[fr][fc] = p; board[tr][tc] = t;
    return safe;
}

function checkGameOver() {
    let moves = 0;
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) 
        if(board[r][c] && isOwn(board[r][c])) 
            for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) 
                if(canMoveLogic(r, c, tr, tc) && isSafeMove(r, c, tr, tc)) moves++;
    if(moves === 0) {
        const k = findKing(turn), inCheck = isAttacked(k.r, k.c, turn==="white"?"black":"white");
        if(inCheck) {
            const winner = (turn === "white" ? "Schwarz" : "Weiß");
            statusEl.textContent = `MATT! ${winner} GEWINNT!`;
            if(winner === "Weiß" && myColor === "white") unlockAchievement("firstWin");
            if(socket.readyState === 1) socket.send(JSON.stringify({ type: 'win', playerName: getMyName() }));
        } else statusEl.textContent = "PATT! Unentschieden.";
        return true;
    }
    return false;
}

function doMove(fr, fc, tr, tc, emit = true) {
    history.push(JSON.stringify({ b: board.map(r => [...r]), t: turn }));
    const isCap = board[tr][tc] !== "";
    if(isCap) unlockAchievement("firstBlood");
    
    board[tr][tc] = board[fr][fc]; board[fr][fc] = "";
    
    if(board[tr][tc] === 'P' && tr === 0) { board[tr][tc] = 'Q'; unlockAchievement("pawnMaster"); }
    if(board[tr][tc] === 'p' && tr === 7) { board[tr][tc] = 'q'; unlockAchievement("pawnMaster"); }

    if(emit && socket.readyState === 1 && gameModeSelect.value !== "local") {
        socket.send(JSON.stringify({ type: 'move', move: {fr, fc, tr, tc}, room: onlineRoom }));
    }

    turn = (turn === "white" ? "black" : "white");
    const k = findKing(turn), inCheck = isAttacked(k.r, k.c, turn==="white"?"black":"white");
    if(inCheck) sounds.check.play(); else if(isCap) sounds.cap.play(); else sounds.move.play();
    
    if(!checkGameOver()) statusEl.textContent = (turn === "white" ? "Weiß" : "Schwarz") + (inCheck ? " steht im SCHACH!" : " am Zug");
    possibleMoves = [];
    draw();
    if(turn === "black" && gameModeSelect.value === "bot") stockfishWorker.postMessage({ board, turn: "black" });
}

function draw() {
    boardEl.innerHTML = "";
    const k = findKing(turn);
    const inCheck = k ? isAttacked(k.r, k.c, turn==="white"?"black":"white") : false;

    board.forEach((row, r) => {
        row.forEach((p, c) => {
            const d = document.createElement("div");
            d.className = `square ${(r+c)%2 ? "black-sq" : "white-sq"}`;
            if(selected && selected.r === r && selected.c === c) d.classList.add("selected");
            if(inCheck && p && p.toLowerCase()==='k' && isOwn(p)) d.classList.add("in-check");
            
            if(possibleMoves.some(m => m.tr === r && m.tc === c)) {
                const dot = document.createElement("div");
                dot.className = "possible-move-dot " + (board[r][c] ? "capture-hint" : "");
                d.appendChild(dot);
            }
            if(p) { const img = document.createElement("img"); img.src = PIECES[p]; img.style.width="85%"; d.appendChild(img); }
            
            d.onclick = () => {
                if((gameModeSelect.value === "online" || gameModeSelect.value === "random") && turn !== myColor) return;
                if(selected) {
                    if(canMoveLogic(selected.r, selected.c, r, c) && isSafeMove(selected.r, selected.c, r, c)) {
                        doMove(selected.r, selected.c, r, c); selected = null;
                    } else selected = (board[r][c] && isOwn(board[r][c])) ? {r, c} : null;
                } else if(board[r][c] && isOwn(board[r][c])) selected = {r, c};
                
                possibleMoves = selected ? [] : [];
                if(selected) {
                    for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) 
                        if(canMoveLogic(selected.r, selected.c, tr, tc) && isSafeMove(selected.r, selected.c, tr, tc)) 
                            possibleMoves.push({tr, tc});
                }
                draw();
            };
            boardEl.appendChild(d);
        });
    });
    updateBoardColors();
}

const cpW = document.getElementById("colorWhite"), cpB = document.getElementById("colorBlack");
function updateBoardColors() {
    document.querySelectorAll(".white-sq").forEach(s => s.style.backgroundColor = cpW.value);
    document.querySelectorAll(".black-sq").forEach(s => s.style.backgroundColor = cpB.value);
}
cpW.oninput = updateBoardColors; cpB.oninput = updateBoardColors;

function resetGame() {
    board = [["r","n","b","q","k","b","n","r"],["p","p","p","p","p","p","p","p"],["","","","","","","",""],["","","","","","","",""],["","","","","","","",""],["","","","","","","",""],["P","P","P","P","P","P","P","P"],["R","N","B","Q","K","B","N","R"]];
    turn = "white"; selected = null; history = []; possibleMoves = [];
    statusEl.textContent = "Weiß am Zug";
    draw();
}

document.getElementById("undoBtn").onclick = () => {
    if(history.length > 0) {
        unlockAchievement("undoKing");
        const last = JSON.parse(history.pop()); board = last.b; turn = last.t;
        if(gameModeSelect.value === "bot" && history.length > 0) {
            const p = JSON.parse(history.pop()); board = p.b; turn = p.t;
        }
        draw();
    }
};
document.getElementById("resetBtn").onclick = resetGame;
document.getElementById("connectMP").onclick = () => {
    socket.send(JSON.stringify({ type: 'join', room: document.getElementById("roomID").value || "global", name: getMyName() }));
};
stockfishWorker.onmessage = (e) => { if(e.data) setTimeout(() => doMove(e.data.fr, e.data.fc, e.data.tr, e.data.tc, false), 500); };

updateAchievementUI();
resetGame();

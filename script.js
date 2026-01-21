// --- ELEMENTE ---
const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-chat");
const gameModeSelect = document.getElementById("gameMode");

// --- VERBINDUNGEN ---
// 1. Online Server
const socket = new WebSocket("wss://mein-schach-vo91.onrender.com");
// 2. KI Worker (für Bot-Modus)
let stockfishWorker = new Worker('engineWorker.js');

// --- SOUNDS ---
const moveSound = new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/move-self.mp3');
const captureSound = new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/capture.mp3');
const checkSound = new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/move-check.mp3');

const PIECE_URLS = {
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg', 'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg', 'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg', 'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg', 'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg', 'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg', 'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg'
};

let board, turn = "white", selected = null, history = [];

// --- BOT / KI LOGIK ---
stockfishWorker.onmessage = function(e) {
    const move = e.data;
    if (move && turn === "black") {
        setTimeout(() => {
            doMove(move.fr, move.fc, move.tr, move.tc, false);
        }, 600);
    }
};

function triggerBot() {
    if (gameModeSelect.value === "bot" && turn === "black") {
        stockfishWorker.postMessage({ board: board, turn: "black" });
    }
}

// --- MULTIPLAYER LOGIK ---
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'move' && gameModeSelect.value !== "bot") {
        doMove(data.move.fr, data.move.fc, data.move.tr, data.move.tc, false);
    }
    if (data.type === 'chat') {
        addChat("Gegner", data.text, "other");
    }
};

document.getElementById("connectMP").onclick = () => {
    const room = document.getElementById("roomID").value || "global";
    socket.send(JSON.stringify({ type: 'join', room: room, name: 'WeltGast' }));
    addChat("System", `Raum ${room} beigetreten`, "other");
};

// --- CHAT ---
function addChat(sender, text, type) {
    const m = document.createElement("div");
    m.className = `msg ${type === 'me' ? 'my-msg' : 'other-msg'}`;
    m.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chatMessages.appendChild(m);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendMessage() {
    const text = chatInput.value.trim();
    if (text && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'chat', text: text }));
        addChat("Du", text, "me");
        chatInput.value = "";
    }
}
sendBtn.onclick = sendMessage;

// --- SCHACH LOGIK ---
function resetGame() {
    board = [
        ["r","n","b","q","k","b","n","r"], ["p","p","p","p","p","p","p","p"],
        ["","","","","","","",""], ["","","","","","","",""],
        ["","","","","","","",""], ["","","","","","","",""],
        ["P","P","P","P","P","P","P","P"], ["R","N","B","Q","K","B","N","R"]
    ];
    turn = "white"; selected = null; draw();
}

function isOwn(p) { return p && (turn === "white" ? p === p.toUpperCase() : p === p.toLowerCase()); }

function doMove(fr, fc, tr, tc, emit = true) {
    const isCap = board[tr][tc] !== "";
    board[tr][tc] = board[fr][fc];
    board[fr][fc] = "";

    // Bauernumwandlung
    if(board[tr][tc] === 'P' && tr === 0) board[tr][tc] = 'Q';
    if(board[tr][tc] === 'p' && tr === 7) board[tr][tc] = 'q';

    // Nur senden, wenn wir NICHT gegen den Bot spielen
    if (emit && gameModeSelect.value !== "bot" && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'move', move: {fr, fc, tr, tc} }));
    }

    isCap ? captureSound.play() : moveSound.play();
    turn = turn === "white" ? "black" : "white";
    draw();

    // KI antwortet
    if (turn === "black") triggerBot();
}

function draw() {
    boardEl.innerHTML = "";
    board.forEach((row, r) => row.forEach((p, c) => {
        const d = document.createElement("div");
        d.className = `square ${(r + c) % 2 ? "black-sq" : "white-sq"}`;
        if (selected && selected.r === r && selected.c === c) d.classList.add("selected");
        if (p) {
            const img = document.createElement("img");
            img.src = PIECE_URLS[p]; img.style.width = "85%";
            d.appendChild(img);
        }
        d.onclick = () => {
            if (selected) {
                // Hier könnte man noch canMove(selected.r, selected.c, r, c) prüfen
                doMove(selected.r, selected.c, r, c);
                selected = null;
            } else if (isOwn(p)) {
                selected = {r, c};
            }
            draw();
        };
        boardEl.appendChild(d);
    }));
    statusEl.textContent = turn === "white" ? "Weiß am Zug" : "Schwarz am Zug";
}

document.getElementById("resetBtn").onclick = resetGame;
resetGame();

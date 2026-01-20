// --- VERBINDUNG ---
const socket = new WebSocket("wss://mein-schach-vo91.onrender.com");

const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-chat");
const roomInput = document.getElementById("roomID");
const connectBtn = document.getElementById("connectMP");

// Sounds
const moveSound = new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/move-self.mp3');
const captureSound = new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/capture.mp3');

const PIECE_URLS = {
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg', 'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg', 'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg', 'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg', 'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg', 'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg', 'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg'
};

let board, turn = "white", selected = null, history = [];

// --- MULTIPLAYER EVENTS ---
socket.onopen = () => {
    statusEl.textContent = "Verbunden! Weiß am Zug";
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'move') {
        executeMove(data.move.fr, data.move.fc, data.move.tr, data.move.tc, false);
    }
    if (data.type === 'chat') {
        addChat("Gegner", data.text, "other");
    }
};

connectBtn.onclick = () => {
    const room = roomInput.value.trim();
    if (room) {
        socket.send(JSON.stringify({ type: 'join', room: room }));
        addChat("System", "Raum " + room + " beigetreten", "other");
    }
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
    turn = "white"; draw();
}

function executeMove(fr, fc, tr, tc, emit = true) {
    const isCap = board[tr][tc] !== "";
    board[tr][tc] = board[fr][fc];
    board[fr][fc] = "";
    
    if (emit) socket.send(JSON.stringify({ type: 'move', move: {fr, fc, tr, tc} }));
    
    isCap ? captureSound.play().catch(() => {}) : moveSound.play().catch(() => {});
    turn = (turn === "white" ? "black" : "white");
    draw();
}

function draw() {
    boardEl.innerHTML = "";
    board.forEach((row, r) => row.forEach((p, c) => {
        const d = document.createElement("div");
        d.className = `square ${(r + c) % 2 ? "black-sq" : "white-sq"}`;
        if (selected && selected.r === r && selected.c === c) d.classList.add("selected");
        if (p) {
            const img = document.createElement("img");
            img.src = PIECE_URLS[p];
            d.appendChild(img);
        }
        d.onclick = () => {
            const isOwn = p && (turn === "white" ? p === p.toUpperCase() : p === p.toLowerCase());
            if (selected) {
                if (selected.r === r && selected.c === c) { selected = null; }
                else { executeMove(selected.r, selected.c, r, c, true); selected = null; }
            } else if (isOwn) {
                selected = {r, c};
            }
            draw();
        };
        boardEl.appendChild(d);
    }));
    statusEl.textContent = (turn === "white" ? "Weiß am Zug" : "Schwarz am Zug");
}

document.getElementById("resetBtn").onclick = resetGame;
resetGame();

const socket = new WebSocket("wss://mein-schach-vo91.onrender.com");
const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-chat");

const PIECE_URLS = {
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg', 'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg', 'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qdt45.svg', 'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg', 'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg', 'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg', 'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg'
};

let board, turn = "white", selected = null, myColor = "white";

// WebSocket Events
socket.onopen = () => {
    statusEl.textContent = "Verbunden. Viel Erfolg!";
    socket.send(JSON.stringify({ type: 'join', room: 'global', name: 'Spieler' }));
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'match_found') {
        myColor = data.color;
        alert("Spiel gestartet! Du bist " + (myColor === 'white' ? "Weiß" : "Schwarz"));
        resetGame();
    }
    if (data.type === 'global_chat') {
        addChat(data.sender, data.text);
    }
    if (data.type === 'move') {
        executeMove(data.move.fr, data.move.fc, data.move.tr, data.move.tc, false);
    }
};

function addChat(sender, text) {
    const msg = document.createElement("div");
    msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendMessage() {
    const text = chatInput.value.trim();
    if (text && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'global_chat', sender: 'Ich', text: text }));
        addChat("Du", text);
        chatInput.value = "";
    }
}
sendBtn.onclick = sendMessage;

function findOpponent() {
    socket.send(JSON.stringify({ type: 'find_random' }));
    statusEl.textContent = "Suche Gegner...";
}

// Schach Logik
function resetGame() {
    board = [
        ["r","n","b","q","k","b","n","r"], ["p","p","p","p","p","p","p","p"],
        ["","","","","","","",""], ["","","","","","","",""],
        ["","","","","","","",""], ["","","","","","","",""],
        ["P","P","P","P","P","P","P","P"], ["R","N","B","Q","K","B","N","R"]
    ];
    turn = "white";
    draw();
}

function executeMove(fr, fc, tr, tc, emit) {
    board[tr][tc] = board[fr][fc];
    board[fr][fc] = "";
    if (emit) socket.send(JSON.stringify({ type: 'move', move: {fr, fc, tr, tc} }));
    turn = turn === "white" ? "black" : "white";
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
            if (selected) {
                executeMove(selected.r, selected.c, r, c, true);
                selected = null;
            } else if (p) {
                selected = {r, c};
            }
            draw();
        };
        boardEl.appendChild(d);
    }));
    statusEl.textContent = turn === "white" ? "Weiß ist am Zug" : "Schwarz ist am Zug";
}
resetGame();

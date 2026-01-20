const socket = new WebSocket("wss://mein-schach-vo91.onrender.com");
const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-chat");

const moveSnd = new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/move-self.mp3');
const captureSnd = new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/capture.mp3');

const PIECES = {
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg', 'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg', 'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg', 'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg', 'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg', 'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg', 'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg'
};

let board, turn = "white", selected = null, myColor = "white";

socket.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'move') { updateMove(data.fr, data.fc, data.tr, data.tc, false); }
    if (data.type === 'chat') { addChat("WeltGast", data.text, "other"); }
    if (data.type === 'user_count') { document.getElementById("user-counter").textContent = "Online: " + data.count; }
    if (data.type === 'match_found') { 
        myColor = data.color; 
        addChat("System", "Match gefunden! Du bist " + (myColor === 'white' ? 'Weiß' : 'Schwarz'), "other");
    }
};

function addChat(sender, text, type) {
    const div = document.createElement("div");
    div.className = type === 'me' ? 'my-msg' : 'other-msg';
    div.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendMsg() {
    const text = chatInput.value.trim();
    if (text) {
        socket.send(JSON.stringify({ type: 'chat', text }));
        addChat("Du", text, "me");
        chatInput.value = "";
    }
}
sendBtn.onclick = sendMsg;

function updateMove(fr, fc, tr, tc, emit) {
    const piece = board[fr][fc];
    const target = board[tr][tc];
    board[tr][tc] = piece;
    board[fr][fc] = "";
    if (emit) socket.send(JSON.stringify({ type: 'move', fr, fc, tr, tc }));
    target ? captureSnd.play() : moveSnd.play();
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
            img.src = PIECES[p]; img.style.width = "100%";
            d.appendChild(img);
        }
        d.onclick = () => {
            if (selected) {
                updateMove(selected.r, selected.c, r, c, true);
                selected = null;
            } else if (p) {
                selected = {r, c};
            }
            draw();
        };
        boardEl.appendChild(d);
    }));
    statusEl.textContent = turn === "white" ? "Weiß am Zug" : "Schwarz am Zug";
}

function init() {
    board = [
        ["r","n","b","q","k","b","n","r"], ["p","p","p","p","p","p","p","p"],
        ["","","","","","","",""], ["","","","","","","",""],
        ["","","","","","","",""], ["","","","","","","",""],
        ["P","P","P","P","P","P","P","P"], ["R","N","B","Q","K","B","N","R"]
    ];
    draw();
}
document.getElementById("connectMP").onclick = () => {
    const r = document.getElementById("roomID").value;
    socket.send(JSON.stringify({ type: 'join', room: r }));
    addChat("System", "Raum beigetreten: " + r, "other");
};
init();

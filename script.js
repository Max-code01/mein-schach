const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const gameModeSelect = document.getElementById("gameMode");
const nameInput = document.getElementById("playerName");

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

let board, turn = "white", selected = null;
let myColor = "white", onlineRoom = null;

// Chat-Funktion
function addChat(sender, text, type) {
    const m = document.createElement("div");
    m.className = type === "system" ? "msg system-msg" : `msg ${type === 'me' ? 'my-msg' : 'other-msg'}`;
    m.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chatMessages.appendChild(m);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Nachricht senden
document.getElementById("send-chat").onclick = () => {
    const t = chatInput.value.trim();
    if(t && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'chat', text: t, sender: nameInput.value || "Anonym", room: onlineRoom }));
        addChat("Ich", t, "me");
        chatInput.value = "";
    }
};

// WebSocket Handler
socket.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if(d.type === 'chat') addChat(d.sender, d.text, "other");
    if(d.type === 'leaderboard') {
        const list = document.getElementById("leaderboard-list");
        list.innerHTML = d.list.map(p => `<div>${p.name}: ${p.wins} 🏆</div>`).join('');
    }
    if(d.type === 'user-count') document.getElementById("user-counter").textContent = `Online: ${d.count} ● Live`;
};

// ... (Restliche Schach-Logik: canMoveLogic, isSafeMove, draw, doMove, resetGame)
// Kopiere hier deine funktionierende Schach-Logik wieder rein.

document.getElementById("undoBtn").onclick = () => { /* Undo Logik */ };
document.getElementById("resetBtn").onclick = resetGame;
document.getElementById("resignBtn").onclick = () => {
    addChat("System", "Spiel aufgegeben.", "system");
    resetGame();
};

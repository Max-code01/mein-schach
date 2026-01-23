/* ===== ENGINE WORKER (Vollständig) ===== */
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Hilfsfunktionen für den Worker
function cloneBoard(board) { return board.map(r => [...r]); }

function isOwn(p, turn) {
    if (!p) return false;
    return turn === "white" ? p === p.toUpperCase() : p === p.toLowerCase();
}

// Grundlegende Zug-Validierung für die KI
function canMoveSimple(board, fr, fc, tr, tc, turn) {
    const p = board[fr][fc];
    const t = board[tr][tc];
    if (t && isOwn(t, turn)) return false;

    const dr = tr - fr, dc = tc - fc;
    const ar = Math.abs(dr), ac = Math.abs(dc);
    const type = p.toLowerCase();

    // Vereinfachte Logik für den Worker
    if (type === 'p') {
        const dir = p === 'P' ? -1 : 1;
        if (dc === 0 && dr === dir && !t) return true;
        if (ac === 1 && dr === dir && t) return true;
        return false;
    }
    if (type === 'r') return (fr === tr || fc === tc) && isPathClear(board, fr, fc, tr, tc);
    if (type === 'b') return ar === ac && isPathClear(board, fr, fc, tr, tc);
    if (type === 'q') return (fr === tr || fc === tc || ar === ac) && isPathClear(board, fr, fc, tr, tc);
    if (type === 'n') return (ar === 2 && ac === 1) || (ar === 1 && ac === 2);
    if (type === 'k') return ar <= 1 && ac <= 1;
    
    return false;
}

function isPathClear(board, fr, fc, tr, tc) {
    const dr = tr > fr ? 1 : tr < fr ? -1 : 0;
    const dc = tc > fc ? 1 : tc < fc ? -1 : 0;
    let r = fr + dr, c = fc + dc;
    while (r !== tr || c !== tc) {
        if (board[r][c] !== "") return false;
        r += dr; c += dc;
    }
    return true;
}

// Zug-Generator
function generateMoves(board, turn) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (isOwn(board[r][c], turn)) {
                for (let tr = 0; tr < 8; tr++) {
                    for (let tc = 0; tc < 8; tc++) {
                        if (canMoveSimple(board, r, c, tr, tc, turn)) {
                            moves.push({ fr: r, fc: c, tr: tr, tc: tc });
                        }
                    }
                }
            }
        }
    }
    return moves;
}

// Bewertung
function evaluate(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p) {
                const val = VALUE[p.toLowerCase()] || 0;
                score += (p === p.toUpperCase() ? 1 : -1) * val;
            }
        }
    }
    return score;
}

// Alpha-Beta Algorithmus
function alphaBeta(board, depth, alpha, beta, maximizing, turn) {
    if (depth === 0) return evaluate(board);

    const moves = generateMoves(board, turn);
    const nextTurn = turn === "white" ? "black" : "white";

    if (maximizing) {
        let maxEval = -Infinity;
        for (const m of moves) {
            const b2 = cloneBoard(board);
            b2[m.tr][m.tc] = b2[m.fr][m.fc];
            b2[m.fr][m.fc] = "";
            const score = alphaBeta(b2, depth - 1, alpha, beta, false, nextTurn);
            maxEval = Math.max(maxEval, score);
            alpha = Math.max(alpha, score);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const m of moves) {
            const b2 = cloneBoard(board);
            b2[m.tr][m.tc] = b2[m.fr][m.fc];
            b2[m.fr][m.fc] = "";
            const score = alphaBeta(b2, depth - 1, alpha, beta, true, nextTurn);
            minEval = Math.min(minEval, score);
            beta = Math.min(beta, score);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

/* ===== MESSAGE HANDLER ===== */
onmessage = function(e) {
    const { board, turn } = e.data;
    const moves = generateMoves(board, turn);
    
    if (moves.length === 0) {
        postMessage(null);
        return;
    }

    let bestMove = moves[0];
    let bestScore = turn === "white" ? -Infinity : Infinity;
    const depth = 2; // Tiefe für flüssiges Spiel

    for (const m of moves) {
        const b2 = cloneBoard(board);
        b2[m.tr][m.tc] = b2[m.fr][m.fc];
        b2[m.fr][m.fc] = "";
        
        const score = alphaBeta(b2, depth - 1, -Infinity, Infinity, turn !== "white", turn === "white" ? "black" : "white");
        
        if (turn === "white" && score > bestScore) {
            bestScore = score;
            bestMove = m;
        } else if (turn === "black" && score < bestScore) {
            bestScore = score;
            bestMove = m;
        }
    }
    
    postMessage(bestMove);
};

/* ===== ENGINE WORKER (VOLLSTÄNDIG) ===== */
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Positionstabellen für intelligentere Züge
const PST = {
    p: [
        [0,  0,  0,  0,  0,  0,  0,  0], [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10], [5,  5, 10, 25, 25, 10,  5,  5],
        [0,  0,  0, 20, 20,  0,  0,  0], [5, -5,-10,  0,  0,-10, -5,  5],
        [5, 10, 10,-20,-20, 10, 10,  5], [0,  0,  0,  0,  0,  0,  0,  0]
    ]
};

function cloneBoard(board) { return board.map(r => [...r]); }
function isOwn(p, turn) {
    if (!p) return false;
    return turn === "white" ? p === p.toUpperCase() : p === p.toLowerCase();
}

function canMoveSimple(board, fr, fc, tr, tc, turn) {
    const p = board[fr][fc]; const t = board[tr][tc];
    if (t && isOwn(t, turn)) return false;
    const dr = tr - fr, dc = tc - fc;
    const ar = Math.abs(dr), ac = Math.abs(dc);
    const type = p.toLowerCase();
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
    const dr = Math.sign(tr - fr), dc = Math.sign(tc - fc);
    let r = fr + dr, c = fc + dc;
    while (r !== tr || c !== tc) { if (board[r][c] !== "") return false; r += dr; c += dc; }
    return true;
}

function generateMoves(board, turn) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (isOwn(board[r][c], turn)) {
                for (let tr = 0; tr < 8; tr++) {
                    for (let tc = 0; tc < 8; tc++) {
                        if (canMoveSimple(board, r, c, tr, tc, turn)) moves.push({ fr: r, fc: c, tr: tr, tc: tc });
                    }
                }
            }
        }
    }
    return moves;
}

function evaluate(board, diff) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p) {
                let val = VALUE[p.toLowerCase()] || 0;
                if (diff === "bot_hard" && p.toLowerCase() === 'p') val += PST.p[p === 'P' ? r : 7 - r][c];
                score += (p === p.toUpperCase() ? 1 : -1) * val;
            }
        }
    }
    return score;
}

function alphaBeta(board, depth, alpha, beta, maximizing, turn, diff) {
    if (depth === 0) return evaluate(board, diff);
    const moves = generateMoves(board, turn);
    const nextTurn = turn === "white" ? "black" : "white";
    if (maximizing) {
        let maxEval = -Infinity;
        for (const m of moves) {
            const b2 = cloneBoard(board); b2[m.tr][m.tc] = b2[m.fr][m.fc]; b2[m.fr][m.fc] = "";
            const score = alphaBeta(b2, depth - 1, alpha, beta, false, nextTurn, diff);
            maxEval = Math.max(maxEval, score); alpha = Math.max(alpha, score);
            if (beta <= alpha) break;
        }
        return moves.length === 0 ? -100000 : maxEval;
    } else {
        let minEval = Infinity;
        for (const m of moves) {
            const b2 = cloneBoard(board); b2[m.tr][m.tc] = b2[m.fr][m.fc]; b2[m.fr][m.fc] = "";
            const score = alphaBeta(b2, depth - 1, alpha, beta, true, nextTurn, diff);
            minEval = Math.min(minEval, score); beta = Math.min(beta, score);
            if (beta <= alpha) break;
        }
        return moves.length === 0 ? 100000 : minEval;
    }
}

onmessage = function(e) {
    const { board, turn, difficulty } = e.data;
    const moves = generateMoves(board, turn);
    if (moves.length === 0) { postMessage(null); return; }

    const depth = (difficulty === "bot_hard") ? 3 : 1;
    if (difficulty === "bot_easy") moves.sort(() => Math.random() - 0.5);

    let bestMove = moves[0], bestScore = turn === "white" ? -Infinity : Infinity;
    for (const m of moves) {
        const b2 = cloneBoard(board); b2[m.tr][m.tc] = b2[m.fr][m.fc]; b2[m.fr][m.fc] = "";
        const score = alphaBeta(b2, depth - 1, -Infinity, Infinity, turn !== "white", turn === "white" ? "black" : "white", difficulty);
        if (turn === "white" ? score > bestScore : score < bestScore) { bestScore = score; bestMove = m; }
    }
    postMessage(bestMove);
};

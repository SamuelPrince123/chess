/* ============================================================
   Endgame — a from-scratch chess engine + UI
   Board convention: row 0 = rank 8 (top), row 7 = rank 1 (bottom)
                      col 0 = file a (left), col 7 = file h (right)
   ============================================================ */

const PIECE_UNICODE = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};

const FILES = "abcdefgh";

function initialBoard() {
  const back = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: back[c], color: "b" };
    board[1][c] = { type: "p", color: "b" };
    board[6][c] = { type: "p", color: "w" };
    board[7][c] = { type: back[c], color: "w" };
  }
  return board;
}

function freshState() {
  return {
    board: initialBoard(),
    turn: "w",
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null, // {r,c} square a pawn could capture onto
    capturedByWhite: [], // black pieces captured
    capturedByBlack: [], // white pieces captured
    moveLog: [],
    flipped: false,
    lastMove: null, // {from:{r,c}, to:{r,c}}
  };
}

let state = freshState();
let historyStack = []; // snapshots for undo
let selected = null; // {r,c}
let legalMovesForSelected = [];

function cloneState(s) {
  return {
    board: s.board.map((row) => row.map((cell) => (cell ? { ...cell } : null))),
    turn: s.turn,
    castling: { ...s.castling },
    enPassant: s.enPassant ? { ...s.enPassant } : null,
    capturedByWhite: [...s.capturedByWhite],
    capturedByBlack: [...s.capturedByBlack],
    moveLog: [...s.moveLog],
    flipped: s.flipped,
    lastMove: s.lastMove ? { from: { ...s.lastMove.from }, to: { ...s.lastMove.to } } : null,
  };
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === "k" && p.color === color) return { r, c };
    }
  return null;
}

const KNIGHT_OFFSETS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING_OFFSETS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const BISHOP_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ROOK_DIRS = [[-1,0],[1,0],[0,-1],[0,1]];

function isSquareAttacked(board, r, c, byColor) {
  // Pawn attacks: a byColor pawn attacks (r,c) if it sits diagonally "ahead" of that square
  const pawnDir = byColor === "w" ? 1 : -1; // white pawns attack upward (toward smaller r), so attacker sits at r+1
  for (const dc of [-1, 1]) {
    const pr = r + pawnDir, pc = c + dc;
    if (inBounds(pr, pc)) {
      const p = board[pr][pc];
      if (p && p.color === byColor && p.type === "p") return true;
    }
  }
  // Knights
  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === byColor && p.type === "n") return true;
    }
  }
  // King
  for (const [dr, dc] of KING_OFFSETS) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === byColor && p.type === "k") return true;
    }
  }
  // Sliding: bishop/queen diagonals
  for (const [dr, dc] of BISHOP_DIRS) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === byColor && (p.type === "b" || p.type === "q")) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  // Sliding: rook/queen orthogonal
  for (const [dr, dc] of ROOK_DIRS) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === byColor && (p.type === "r" || p.type === "q")) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  return false;
}

function isInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return false;
  return isSquareAttacked(board, king.r, king.c, color === "w" ? "b" : "w");
}

// Generate pseudo-legal moves (doesn't check for leaving own king in check)
function pseudoMoves(s, r, c) {
  const board = s.board;
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];
  const color = piece.color;
  const enemy = color === "w" ? "b" : "w";

  const addMove = (nr, nc, extra = {}) => {
    if (!inBounds(nr, nc)) return;
    const target = board[nr][nc];
    if (target && target.color === color) return;
    moves.push({ from: { r, c }, to: { r: nr, c: nc }, capture: !!target, ...extra });
  };

  if (piece.type === "p") {
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    const promoRow = color === "w" ? 0 : 7;
    // forward one
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      addMove(r + dir, c, { promotion: r + dir === promoRow });
      // forward two
      if (r === startRow && !board[r + 2 * dir][c]) {
        addMove(r + 2 * dir, c, { doubleStep: true });
      }
    }
    // captures
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const target = board[nr][nc];
      if (target && target.color === enemy) {
        addMove(nr, nc, { promotion: nr === promoRow });
      } else if (s.enPassant && s.enPassant.r === nr && s.enPassant.c === nc) {
        addMove(nr, nc, { enPassantCapture: true });
      }
    }
  } else if (piece.type === "n") {
    for (const [dr, dc] of KNIGHT_OFFSETS) addMove(r + dr, c + dc);
  } else if (piece.type === "k") {
    for (const [dr, dc] of KING_OFFSETS) addMove(r + dr, c + dc);
    // Castling
    const homeRow = color === "w" ? 7 : 0;
    if (r === homeRow && c === 4 && !isInCheck(board, color)) {
      const rights = s.castling;
      const kSide = color === "w" ? rights.wK : rights.bK;
      const qSide = color === "w" ? rights.wQ : rights.bQ;
      if (kSide && !board[homeRow][5] && !board[homeRow][6] &&
          board[homeRow][7] && board[homeRow][7].type === "r" && board[homeRow][7].color === color &&
          !isSquareAttacked(board, homeRow, 5, enemy) && !isSquareAttacked(board, homeRow, 6, enemy)) {
        moves.push({ from: { r, c }, to: { r: homeRow, c: 6 }, castle: "K" });
      }
      if (qSide && !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3] &&
          board[homeRow][0] && board[homeRow][0].type === "r" && board[homeRow][0].color === color &&
          !isSquareAttacked(board, homeRow, 3, enemy) && !isSquareAttacked(board, homeRow, 2, enemy)) {
        moves.push({ from: { r, c }, to: { r: homeRow, c: 2 }, castle: "Q" });
      }
    }
  } else {
    const dirs = piece.type === "b" ? BISHOP_DIRS : piece.type === "r" ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      while (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!target) {
          addMove(nr, nc);
        } else {
          if (target.color === enemy) addMove(nr, nc);
          break;
        }
        nr += dr; nc += dc;
      }
    }
  }
  return moves;
}

function applyMoveToBoard(s, move) {
  // Mutates a state clone in place, returns captured piece (or null)
  const { board } = s;
  const piece = board[move.from.r][move.from.c];
  let captured = null;

  if (move.enPassantCapture) {
    const capR = move.from.r; // the captured pawn sits on the same row as the mover, same col as destination
    captured = board[capR][move.to.c];
    board[capR][move.to.c] = null;
  } else if (board[move.to.r][move.to.c]) {
    captured = board[move.to.r][move.to.c];
  }

  board[move.to.r][move.to.c] = piece;
  board[move.from.r][move.from.c] = null;

  if (move.castle === "K") {
    const homeRow = move.from.r;
    board[homeRow][5] = board[homeRow][7];
    board[homeRow][7] = null;
  } else if (move.castle === "Q") {
    const homeRow = move.from.r;
    board[homeRow][3] = board[homeRow][0];
    board[homeRow][0] = null;
  }

  if (move.promotion) {
    board[move.to.r][move.to.c] = { type: move.promoteTo || "q", color: piece.color };
  }

  // Update castling rights
  if (piece.type === "k") {
    if (piece.color === "w") { s.castling.wK = false; s.castling.wQ = false; }
    else { s.castling.bK = false; s.castling.bQ = false; }
  }
  const affectsRook = (r, c) => {
    if (r === 7 && c === 0) s.castling.wQ = false;
    if (r === 7 && c === 7) s.castling.wK = false;
    if (r === 0 && c === 0) s.castling.bQ = false;
    if (r === 0 && c === 7) s.castling.bK = false;
  };
  affectsRook(move.from.r, move.from.c);
  affectsRook(move.to.r, move.to.c);

  // Update en passant target
  if (move.doubleStep) {
    const midRow = (move.from.r + move.to.r) / 2;
    s.enPassant = { r: midRow, c: move.from.c };
  } else {
    s.enPassant = null;
  }

  return captured;
}

function legalMoves(s, r, c) {
  const piece = s.board[r][c];
  if (!piece) return [];
  const pseudo = pseudoMoves(s, r, c);
  const legal = [];
  for (const move of pseudo) {
    const clone = cloneState(s);
    applyMoveToBoard(clone, move);
    if (!isInCheck(clone.board, piece.color)) legal.push(move);
  }
  return legal;
}

function allLegalMoves(s, color) {
  const moves = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = s.board[r][c];
      if (p && p.color === color) moves.push(...legalMoves(s, r, c));
    }
  return moves;
}

function squareName(r, c) {
  return FILES[c] + (8 - r);
}

function pieceLetter(type) {
  return { p: "", n: "N", b: "B", r: "R", q: "Q", k: "K" }[type];
}

function buildSAN(s, move, piece, captured, isCheck, isMate) {
  if (move.castle === "K") return isMate ? "O-O#" : isCheck ? "O-O+" : "O-O";
  if (move.castle === "Q") return isMate ? "O-O-O#" : isCheck ? "O-O-O+" : "O-O-O";

  let san = "";
  const dest = squareName(move.to.r, move.to.c);
  const capture = captured || move.enPassantCapture;

  if (piece.type === "p") {
    if (capture) san += FILES[move.from.c] + "x";
    san += dest;
    if (move.promotion) san += "=" + pieceLetter(move.promoteTo || "q");
  } else {
    san += pieceLetter(piece.type);
    // Disambiguation: check if another same-type piece could reach same dest
    const others = allLegalMoves(s, piece.color).filter(m =>
      !(m.from.r === move.from.r && m.from.c === move.from.c) &&
      m.to.r === move.to.r && m.to.c === move.to.c &&
      s.board[m.from.r][m.from.c] &&
      s.board[m.from.r][m.from.c].type === piece.type
    );
    if (others.length > 0) {
      const sameFile = others.some(m => m.from.c === move.from.c);
      const sameRank = others.some(m => m.from.r === move.from.r);
      if (!sameFile) san += FILES[move.from.c];
      else if (!sameRank) san += (8 - move.from.r);
      else san += FILES[move.from.c] + (8 - move.from.r);
    }
    if (capture) san += "x";
    san += dest;
  }
  if (isMate) san += "#";
  else if (isCheck) san += "+";
  return san;
}

let pendingPromotion = null; // {move} awaiting user choice

function attemptMove(move) {
  const piece = state.board[move.from.r][move.from.c];
  if (move.promotion && !move.promoteTo) {
    pendingPromotion = { move, color: piece.color };
    showPromotionModal(piece.color);
    return;
  }
  finalizeMove(move);
}

function finalizeMove(move) {
  historyStack.push(cloneState(state));

  const piece = state.board[move.from.r][move.from.c];
  const captured = applyMoveToBoard(state, move);

  if (captured) {
    if (captured.color === "b") state.capturedByWhite.push(captured.type);
    else state.capturedByBlack.push(captured.type);
  } else if (move.enPassantCapture) {
    // applyMoveToBoard already removed it from board; figure out color
    const capturedColor = piece.color === "w" ? "b" : "w";
    if (capturedColor === "b") state.capturedByWhite.push("p");
    else state.capturedByBlack.push("p");
  }

  const opponent = piece.color === "w" ? "b" : "w";
  const oppInCheck = isInCheck(state.board, opponent);
  const oppMoves = allLegalMoves(state, opponent);
  const isMate = oppInCheck && oppMoves.length === 0;
  const isStalemate = !oppInCheck && oppMoves.length === 0;

  const san = buildSAN(state, move, piece, captured || move.enPassantCapture, oppInCheck, isMate);
  state.moveLog.push({ san, color: piece.color });

  state.lastMove = { from: move.from, to: move.to };
  state.turn = opponent;
  selected = null;
  legalMovesForSelected = [];

  render();

  if (isMate) {
    setStatus(`Checkmate — ${piece.color === "w" ? "White" : "Black"} wins`);
  } else if (isStalemate) {
    setStatus("Stalemate — it's a draw");
  } else if (oppInCheck) {
    setStatus(`${opponent === "w" ? "White" : "Black"} is in check`);
  } else {
    setStatus("");
  }
}

function setStatus(text) {
  document.getElementById("statusBanner").textContent = text;
}

/* ---------------- UI wiring ---------------- */

const boardEl = document.getElementById("board");
const turnTextEl = document.getElementById("turnText");
const turnIndicatorEl = document.getElementById("turnIndicator");
const capturedByWhiteEl = document.getElementById("capturedByWhite");
const capturedByBlackEl = document.getElementById("capturedByBlack");
const moveListEl = document.getElementById("moveList");
const coordsFilesEl = document.getElementById("coordsFiles");
const coordsRanksEl = document.getElementById("coordsRanks");
const promoOverlay = document.getElementById("promoOverlay");
const promoOptions = document.getElementById("promoOptions");

function displayOrder() {
  // returns list of [r,c] in the order they should be rendered (top-left to bottom-right)
  const rows = [...Array(8).keys()];
  const cols = [...Array(8).keys()];
  if (state.flipped) { rows.reverse(); cols.reverse(); }
  const order = [];
  for (const r of rows) for (const c of cols) order.push([r, c]);
  return order;
}

function renderCoords() {
  coordsFilesEl.innerHTML = "";
  coordsRanksEl.innerHTML = "";
  const files = state.flipped ? [...FILES].reverse() : [...FILES];
  const ranks = state.flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
  for (const f of files) {
    const span = document.createElement("span");
    span.textContent = f;
    coordsFilesEl.appendChild(span);
  }
  for (const rk of ranks) {
    const span = document.createElement("span");
    span.textContent = rk;
    coordsRanksEl.appendChild(span);
  }
}

function render() {
  boardEl.innerHTML = "";
  const order = displayOrder();
  const kingInCheckColor = ["w", "b"].find(color => isInCheck(state.board, color) && state.turn === color);

  for (const [r, c] of order) {
    const sq = document.createElement("div");
    const isLight = (r + c) % 2 === 0;
    sq.className = `square ${isLight ? "light" : "dark"}`;
    sq.dataset.r = r;
    sq.dataset.c = c;
    sq.tabIndex = 0;

    if (selected && selected.r === r && selected.c === c) sq.classList.add("selected");
    if (state.lastMove) {
      if (state.lastMove.from.r === r && state.lastMove.from.c === c) sq.classList.add("last-from");
      if (state.lastMove.to.r === r && state.lastMove.to.c === c) sq.classList.add("last-to");
    }
    const moveHere = legalMovesForSelected.find(m => m.to.r === r && m.to.c === c);
    if (moveHere) sq.classList.add(moveHere.capture || moveHere.enPassantCapture ? "legal-capture" : "legal-move");

    const piece = state.board[r][c];
    if (piece) {
      const span = document.createElement("span");
      span.className = "piece";
      span.textContent = PIECE_UNICODE[piece.color + piece.type];
      sq.appendChild(span);
      if (piece.type === "k" && piece.color === kingInCheckColor) sq.classList.add("in-check");
    }

    sq.addEventListener("click", () => onSquareClick(r, c));
    boardEl.appendChild(sq);
  }

  renderCoords();
  renderCaptured();
  renderMoveList();

  turnTextEl.textContent = `${state.turn === "w" ? "White" : "Black"} to move`;
  turnIndicatorEl.classList.toggle("black-turn", state.turn === "b");
}

function renderCaptured() {
  capturedByWhiteEl.innerHTML = "";
  capturedByBlackEl.innerHTML = "";
  const order = { q: 0, r: 1, b: 2, n: 3, p: 4 };
  const sortFn = (a, b) => order[a] - order[b];

  [...state.capturedByWhite].sort(sortFn).forEach(type => {
    const span = document.createElement("span");
    span.className = "ledge-piece";
    span.textContent = PIECE_UNICODE["b" + type];
    capturedByWhiteEl.appendChild(span);
  });
  [...state.capturedByBlack].sort(sortFn).forEach(type => {
    const span = document.createElement("span");
    span.className = "ledge-piece";
    span.textContent = PIECE_UNICODE["w" + type];
    capturedByBlackEl.appendChild(span);
  });
}

function renderMoveList() {
  moveListEl.innerHTML = "";
  for (let i = 0; i < state.moveLog.length; i += 2) {
    const li = document.createElement("li");
    const num = document.createElement("span");
    num.className = "mv-num";
    num.textContent = (i / 2 + 1) + ".";
    const white = document.createElement("span");
    white.className = "mv-white";
    white.textContent = state.moveLog[i] ? state.moveLog[i].san : "";
    const black = document.createElement("span");
    black.className = "mv-black";
    black.textContent = state.moveLog[i + 1] ? state.moveLog[i + 1].san : "";
    li.appendChild(num); li.appendChild(white); li.appendChild(black);
    moveListEl.appendChild(li);
  }
  moveListEl.scrollTop = moveListEl.scrollHeight;
}

function onSquareClick(r, c) {
  if (pendingPromotion) return;
  const piece = state.board[r][c];

  if (selected) {
    const chosen = legalMovesForSelected.find(m => m.to.r === r && m.to.c === c);
    if (chosen) {
      attemptMove(chosen);
      return;
    }
    if (piece && piece.color === state.turn) {
      selected = { r, c };
      legalMovesForSelected = legalMoves(state, r, c);
      render();
      return;
    }
    selected = null;
    legalMovesForSelected = [];
    render();
    return;
  }

  if (piece && piece.color === state.turn) {
    selected = { r, c };
    legalMovesForSelected = legalMoves(state, r, c);
    render();
  }
}

function showPromotionModal(color) {
  promoOptions.innerHTML = "";
  for (const type of ["q", "r", "b", "n"]) {
    const div = document.createElement("div");
    div.className = "promo-option";
    div.textContent = PIECE_UNICODE[color + type];
    div.addEventListener("click", () => {
      const move = pendingPromotion.move;
      move.promoteTo = type;
      pendingPromotion = null;
      promoOverlay.hidden = true;
      finalizeMove(move);
    });
    promoOptions.appendChild(div);
  }
  promoOverlay.hidden = false;
}

document.getElementById("newGameBtn").addEventListener("click", () => {
  state = freshState();
  historyStack = [];
  selected = null;
  legalMovesForSelected = [];
  setStatus("");
  render();
});

document.getElementById("undoBtn").addEventListener("click", () => {
  if (historyStack.length === 0) return;
  state = historyStack.pop();
  selected = null;
  legalMovesForSelected = [];
  setStatus("");
  render();
});

document.getElementById("flipBtn").addEventListener("click", () => {
  state.flipped = !state.flipped;
  render();
});

render();

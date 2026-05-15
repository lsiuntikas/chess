import { useState, useEffect, useCallback, useRef } from "react";

const PIECE_VALUES = { p: 100, n: 325, b: 333, r: 500, q: 900, k: 20000 };
const PST = {
  p: [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
  n: [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
  k: [[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
};

const UNICODE = { K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟' };

// --- Chess Engine ---
function clonePieces(pieces) {
  const out = {};
  for (const k in pieces) out[k] = { ...pieces[k] };
  return out;
}

function key(x, y) { return `${x},${y}`; }
function unkey(k) { const [x,y] = k.split(','); return [+x, +y]; }

function isPathClear(pieces, start, end) {
  const dx = Math.sign(end[0]-start[0]), dy = Math.sign(end[1]-start[1]);
  let cx = start[0]+dx, cy = start[1]+dy;
  while (cx !== end[0] || cy !== end[1]) {
    if (pieces[key(cx,cy)]) return false;
    cx += dx; cy += dy;
  }
  return true;
}

function isPseudoLegal(pieces, start, end, piece, isCap, enPassantSq) {
  const [x1,y1] = start, [x2,y2] = end;
  const dx = x2-x1, dy = y2-y1;
  const pt = piece.type.toLowerCase();

  if (pt === 'p') {
    const dir = piece.color === 'white' ? -1 : 1;
    if (dx === 0 && !isCap) {
      if (dy === dir) return true;
      if (dy === 2*dir && ((y1===6 && piece.color==='white') || (y1===1 && piece.color==='black')))
        return isPathClear(pieces, start, end);
    } else if (Math.abs(dx)===1 && dy===dir) {
      if (isCap || (enPassantSq && enPassantSq[0]===x2 && enPassantSq[1]===y2)) return true;
    }
    return false;
  }
  if (pt === 'n') return (Math.abs(dx)===1 && Math.abs(dy)===2) || (Math.abs(dx)===2 && Math.abs(dy)===1);
  if (pt === 'k') return Math.abs(dx)<=1 && Math.abs(dy)<=1;
  const diag = Math.abs(dx)===Math.abs(dy), straight = dx===0||dy===0;
  if ((pt==='b'&&diag)||(pt==='r'&&straight)||(pt==='q'&&(diag||straight)))
    return isPathClear(pieces, start, end);
  return false;
}

function isSqAttacked(pieces, pos, byColor, enPassantSq) {
  for (const k in pieces) {
    const p = pieces[k];
    if (p.color !== byColor) continue;
    const [px,py] = unkey(k);
    if (p.type.toLowerCase() === 'p') {
      const dir = p.color==='white' ? -1 : 1;
      if (Math.abs(px-pos[0])===1 && py+dir===pos[1]) return true;
    } else if (isPseudoLegal(pieces, [px,py], pos, p, true, enPassantSq)) return true;
  }
  return false;
}

function makeMove(pieces, start, end, enPassantSq, castlingRights) {
  const newPieces = clonePieces(pieces);
  const pk = key(...start), ek = key(...end);
  const p = { ...newPieces[pk] };
  delete newPieces[pk];
  const captured = newPieces[ek] ? { ...newPieces[ek] } : null;
  let epCap = null;
  let newEP = null;
  let newCastling = castlingRights;
  let rookMove = null;

  if (p.type.toLowerCase()==='p' && enPassantSq && enPassantSq[0]===end[0] && enPassantSq[1]===end[1]) {
    const capK = key(end[0], start[1]);
    epCap = { ...newPieces[capK] };
    delete newPieces[capK];
  } else {
    delete newPieces[ek];
  }

  if (p.type.toLowerCase()==='k' && Math.abs(end[0]-start[0])===2) {
    const rx = end[0]>start[0] ? 7 : 0;
    const nrx = end[0]>start[0] ? 5 : 3;
    const rk = key(rx, start[1]);
    if (newPieces[rk]) {
      const ro = { ...newPieces[rk] };
      delete newPieces[rk];
      newPieces[key(nrx, start[1])] = ro;
      rookMove = [rx, nrx];
    }
  }

  if (p.type==='K') newCastling = newCastling.replace('K','').replace('Q','');
  else if (p.type==='k') newCastling = newCastling.replace('k','').replace('q','');
  else if (start[0]===0&&start[1]===7||end[0]===0&&end[1]===7) newCastling = newCastling.replace('Q','');
  else if (start[0]===7&&start[1]===7||end[0]===7&&end[1]===7) newCastling = newCastling.replace('K','');
  else if (start[0]===0&&start[1]===0||end[0]===0&&end[1]===0) newCastling = newCastling.replace('q','');
  else if (start[0]===7&&start[1]===0||end[0]===7&&end[1]===0) newCastling = newCastling.replace('k','');
  if (!newCastling) newCastling = '-';

  if (p.type.toLowerCase()==='p' && Math.abs(end[1]-start[1])===2)
    newEP = [start[0], (start[1]+end[1])>>1];

  p.moved = true;
  if (p.type.toLowerCase()==='p' && (end[1]===0||end[1]===7))
    p.type = p.color==='white' ? 'Q' : 'q';

  newPieces[ek] = p;
  return { newPieces, newEP, newCastling, captured, epCap, rookMove };
}

function getLegalMoves(pieces, color, enPassantSq, castlingRights) {
  const opp = color==='white' ? 'black' : 'white';
  const moves = [];

  for (const sk in pieces) {
    const p = pieces[sk];
    if (p.color !== color) continue;
    const start = unkey(sk);
    for (let x=0; x<8; x++) for (let y=0; y<8; y++) {
      const end = [x,y];
      const target = pieces[key(x,y)];
      if (target && target.color===color) continue;
      if (!isPseudoLegal(pieces, start, end, p, !!target, enPassantSq)) continue;
      const { newPieces } = makeMove(pieces, start, end, enPassantSq, castlingRights);
      const kPos = Object.entries(newPieces).find(([,pi]) => pi.type.toLowerCase()==='k' && pi.color===color);
      if (kPos && !isSqAttacked(newPieces, unkey(kPos[0]), opp, null)) moves.push([start, end]);
    }
  }

  const kEntry = Object.entries(pieces).find(([,p]) => p.type.toLowerCase()==='k' && p.color===color);
  if (kEntry) {
    const kPos = unkey(kEntry[0]);
    if (!isSqAttacked(pieces, kPos, opp, enPassantSq)) {
      const y = kPos[1];
      if ((color==='white'&&castlingRights.includes('K'))||(color==='black'&&castlingRights.includes('k'))) {
        if (!pieces[key(5,y)]&&!pieces[key(6,y)]&&pieces[key(7,y)])
          if (!isSqAttacked(pieces,[5,y],opp,null)&&!isSqAttacked(pieces,[6,y],opp,null))
            moves.push([kPos,[6,y]]);
      }
      if ((color==='white'&&castlingRights.includes('Q'))||(color==='black'&&castlingRights.includes('q'))) {
        if (!pieces[key(1,y)]&&!pieces[key(2,y)]&&!pieces[key(3,y)]&&pieces[key(0,y)])
          if (!isSqAttacked(pieces,[2,y],opp,null)&&!isSqAttacked(pieces,[3,y],opp,null))
            moves.push([kPos,[2,y]]);
      }
    }
  }
  return moves;
}

function evaluate(pieces) {
  let score = 0;
  for (const k in pieces) {
    const p = pieces[k];
    const [x,y] = unkey(k);
    const s = p.type.toLowerCase();
    let v = PIECE_VALUES[s] || 0;
    if (PST[s]) v += p.color==='white' ? PST[s][y][x] : PST[s][7-y][x];
    score += p.color==='white' ? v : -v;
  }
  return score;
}

function minimax(pieces, depth, alpha, beta, maximizing, turn, enPassantSq, castlingRights) {
  if (depth===0) return evaluate(pieces);
  const moves = getLegalMoves(pieces, turn, enPassantSq, castlingRights);
  if (!moves.length) {
    const kEntry = Object.entries(pieces).find(([,p]) => p.type.toLowerCase()==='k' && p.color===turn);
    const opp = turn==='white'?'black':'white';
    if (kEntry && isSqAttacked(pieces, unkey(kEntry[0]), opp, enPassantSq))
      return maximizing ? -100000 : 100000;
    return 0;
  }
  moves.sort((a,b) => (pieces[key(...b[1])] ? 1 : 0) - (pieces[key(...a[1])] ? 1 : 0));
  const opp = turn==='white'?'black':'white';
  let val = maximizing ? -Infinity : Infinity;
  for (const [s,e] of moves) {
    const { newPieces, newEP, newCastling } = makeMove(pieces, s, e, enPassantSq, castlingRights);
    const res = minimax(newPieces, depth-1, alpha, beta, !maximizing, opp, newEP, newCastling);
    if (maximizing) { if (res>val) val=res; if (val>alpha) alpha=val; }
    else { if (res<val) val=res; if (val<beta) beta=val; }
    if (beta<=alpha) break;
  }
  return val;
}

function findBestMove(pieces, color, enPassantSq, castlingRights, depth=3) {
  const moves = getLegalMoves(pieces, color, enPassantSq, castlingRights);
  if (!moves.length) return null;
  const maximizing = color==='white';
  let bestVal = maximizing ? -Infinity : Infinity;
  let bestMove = null;
  const opp = color==='white'?'black':'white';
  for (const [s,e] of moves) {
    const { newPieces, newEP, newCastling } = makeMove(pieces, s, e, enPassantSq, castlingRights);
    const nextMax = color==='black';
    const v = minimax(newPieces, depth, -Infinity, Infinity, nextMax, opp, newEP, newCastling);
    if ((maximizing && v>bestVal) || (!maximizing && v<bestVal)) { bestVal=v; bestMove=[s,e]; }
  }
  return bestMove;
}

function initPieces() {
  const p = {};
  const backRank = ['r','n','b','q','k','b','n','r'];
  for (let x=0; x<8; x++) {
    p[key(x,0)] = { color:'black', type:backRank[x], moved:false };
    p[key(x,1)] = { color:'black', type:'p', moved:false };
    p[key(x,6)] = { color:'white', type:'P', moved:false };
    p[key(x,7)] = { color:'white', type:backRank[x].toUpperCase(), moved:false };
  }
  return p;
}

// --- React UI ---
const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

function squareColor(x, y) { return (x+y)%2===0 ? 'light' : 'dark'; }

export default function Chess() {
  const [mode, setMode] = useState(null); // 'white','black','engine'
  const [pieces, setPieces] = useState({});
  const [turn, setTurn] = useState('white');
  const [enPassantSq, setEnPassantSq] = useState(null);
  const [castlingRights, setCastlingRights] = useState('KQkq');
  const [selected, setSelected] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [lastMove, setLastMove] = useState(null);
  const [positionCounts, setPositionCounts] = useState({});
  const [halfClock, setHalfClock] = useState(0);
  const [promotionPending, setPromotionPending] = useState(null);
  const aiTimerRef = useRef(null);

  const playerColor = mode === 'black' ? 'black' : 'white';
  const flipped = mode === 'black';

  function getStateId(pieces, turn, castlingRights, enPassantSq) {
    const items = Object.entries(pieces).map(([k,p]) => `${k}:${p.type}`).sort().join('|');
    return `${items}||${turn}||${castlingRights}||${enPassantSq ? enPassantSq.join(',') : '-'}`;
  }

  function startGame(m) {
    const p = initPieces();
    setPieces(p); setTurn('white'); setEnPassantSq(null);
    setCastlingRights('KQkq'); setSelected(null); setLegalMoves([]);
    setStatus(null); setHistory([]); setAiThinking(false); setLastMove(null);
    setPositionCounts({}); setHalfClock(0); setMode(m);
  }

  function checkGameStatus(pieces, turn, ep, cr, posCounts, hClock) {
    const sid = getStateId(pieces, turn, cr, ep);
    if ((posCounts[sid]||0) >= 3) return 'draw-repetition';
    if (hClock >= 100) return 'draw-50';
    const moves = getLegalMoves(pieces, turn, ep, cr);
    if (!moves.length) {
      const opp = turn==='white'?'black':'white';
      const kEntry = Object.entries(pieces).find(([,p]) => p.type.toLowerCase()==='k' && p.color===turn);
      if (kEntry && isSqAttacked(pieces, unkey(kEntry[0]), opp, ep)) return 'checkmate';
      return 'stalemate';
    }
    return null;
  }

  function doMove(start, end, piecesNow, turnNow, epNow, crNow, posCounts, hClock, prom) {
    let { newPieces, newEP, newCastling } = makeMove(piecesNow, start, end, epNow, crNow);

    if (prom) {
      const ek = key(...end);
      newPieces[ek] = { ...newPieces[ek], type: turnNow==='white' ? prom.toUpperCase() : prom.toLowerCase() };
    }

    const isPawnOrCap = piecesNow[key(...start)]?.type.toLowerCase()==='p' || !!piecesNow[key(...end)];
    const newHalf = isPawnOrCap ? 0 : hClock+1;

    const newTurn = turnNow==='white'?'black':'white';
    const sid = getStateId(newPieces, newTurn, newCastling, newEP);
    const newPosCounts = { ...posCounts, [sid]: (posCounts[sid]||0)+1 };

    const moveStr = `${FILES[start[0]]}${8-start[1]}→${FILES[end[0]]}${8-end[1]}`;
    const newHistory = [...history, { str: moveStr, color: turnNow }];

    const gs = checkGameStatus(newPieces, newTurn, newEP, newCastling, newPosCounts, newHalf);

    setPieces(newPieces); setTurn(newTurn); setEnPassantSq(newEP);
    setCastlingRights(newCastling); setSelected(null); setLegalMoves([]);
    setLastMove([start, end]); setHistory(newHistory);
    setPositionCounts(newPosCounts); setHalfClock(newHalf);

    if (gs) {
      const msgs = { 'checkmate': `Checkmate! ${turnNow.charAt(0).toUpperCase()+turnNow.slice(1)} wins.`, 'stalemate':'Stalemate — draw.','draw-repetition':'Draw by repetition.','draw-50':'Draw by 50-move rule.' };
      setStatus(msgs[gs]);
    } else {
      setStatus(null);
    }
    return { newPieces, newTurn, newEP, newCastling, newPosCounts, newHalf, gs };
  }

  function handleSquareClick(x, y) {
    if (status || aiThinking || promotionPending) return;
    if (mode !== 'engine' && turn !== playerColor) return;

    const k = key(x,y);
    const p = pieces[k];

    if (selected) {
      const isLegal = legalMoves.some(([ex,ey]) => ex===x && ey===y);
      if (isLegal) {
        const movingPiece = pieces[key(...selected)];
        const isPromotion = movingPiece?.type.toLowerCase()==='p' && (y===0||y===7);
        if (isPromotion) {
          setPromotionPending({ start: selected, end: [x,y] });
          setSelected(null); setLegalMoves([]);
          return;
        }
        const res = doMove(selected, [x,y], pieces, turn, enPassantSq, castlingRights, positionCounts, halfClock, null);
        if (!res.gs && mode !== 'engine') {
          // AI responds if needed
        }
        return;
      }
      if (p && p.color===turn) {
        setSelected([x,y]);
        const moves = getLegalMoves(pieces, turn, enPassantSq, castlingRights);
        setLegalMoves(moves.filter(([s]) => s[0]===x&&s[1]===y).map(([,e]) => e));
        return;
      }
      setSelected(null); setLegalMoves([]);
    } else {
      if (p && p.color===turn) {
        setSelected([x,y]);
        const moves = getLegalMoves(pieces, turn, enPassantSq, castlingRights);
        setLegalMoves(moves.filter(([s]) => s[0]===x&&s[1]===y).map(([,e]) => e));
      }
    }
  }

  function handlePromotion(type) {
    if (!promotionPending) return;
    const { start, end } = promotionPending;
    setPromotionPending(null);
    doMove(start, end, pieces, turn, enPassantSq, castlingRights, positionCounts, halfClock, type);
  }

  // AI move
  useEffect(() => {
    if (!mode || status || promotionPending) return;
    const isAiTurn = mode==='engine' ? true : turn !== playerColor;
    if (!isAiTurn) return;
    setAiThinking(true);
    aiTimerRef.current = setTimeout(() => {
      const best = findBestMove(pieces, turn, enPassantSq, castlingRights, 4);
      if (best) {
        const movingPiece = pieces[key(...best[0])];
        const isPromotion = movingPiece?.type.toLowerCase()==='p' && (best[1][1]===0||best[1][1]===7);
        doMove(best[0], best[1], pieces, turn, enPassantSq, castlingRights, positionCounts, halfClock, isPromotion?'q':null);
      } else {
        setStatus('No moves available.');
      }
      setAiThinking(false);
    }, 120);
    return () => clearTimeout(aiTimerRef.current);
  }, [turn, pieces, mode, status, promotionPending]);

  if (!mode) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:520,gap:32,padding:'2rem 0'}}>
        <h2 style={{fontSize:28,fontWeight:500,margin:0,letterSpacing:'-0.5px',color:'var(--color-text-primary)'}}>Chess</h2>
        <p style={{margin:0,color:'var(--color-text-secondary)',fontSize:15}}>Choose your side to start playing</p>
        <div style={{display:'flex',gap:16}}>
          {[['white','Play as White','♔'],['black','Play as Black','♚'],['engine','Engine vs Engine','⚙']].map(([m,label,icon]) => (
            <button key={m} onClick={()=>startGame(m)} style={{
              display:'flex',flexDirection:'column',alignItems:'center',gap:10,
              padding:'24px 28px',fontSize:14,cursor:'pointer',
              border:'0.5px solid var(--color-border-secondary)',
              borderRadius:'var(--border-radius-lg)',
              background:'var(--color-background-primary)',
              color:'var(--color-text-primary)',
              transition:'background 0.15s',minWidth:120
            }}
            onMouseEnter={e=>e.currentTarget.style.background='var(--color-background-secondary)'}
            onMouseLeave={e=>e.currentTarget.style.background='var(--color-background-primary)'}
            >
              <span style={{fontSize:32}}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const rankLabels = flipped ? ['1','2','3','4','5','6','7','8'] : ['8','7','6','5','4','3','2','1'];
  const fileLabels = flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];

  const sqSize = 62;
  const boardSize = sqSize * 8;

  function renderSquares() {
    const squares = [];
    for (let row=0; row<8; row++) {
      for (let col=0; col<8; col++) {
        const bx = flipped ? 7-col : col;
        const by = flipped ? 7-row : row;
        const isLight = (bx+by)%2===0;
        const k = key(bx,by);
        const p = pieces[k];
        const isSel = selected && selected[0]===bx && selected[1]===by;
        const isLegal = legalMoves.some(e => e[0]===bx&&e[1]===by);
        const isLast = lastMove && ((lastMove[0][0]===bx&&lastMove[0][1]===by)||(lastMove[1][0]===bx&&lastMove[1][1]===by));
        const isCaptureLegal = isLegal && !!p;

        let bg = isLight ? '#F0D9B5' : '#B58863';
        if (isSel) bg = '#F6F669';
        else if (isLast) bg = isLight ? '#CDD26A' : '#AABA4A';

        squares.push(
          <div key={k} onClick={()=>handleSquareClick(bx,by)} style={{
            width:sqSize, height:sqSize, background:bg,
            display:'flex',alignItems:'center',justifyContent:'center',
            position:'relative', cursor: (p&&p.color===turn&&!status&&!aiThinking) ? 'pointer' : 'default',
            boxSizing:'border-box',
            border: isSel ? '2px solid rgba(255,255,0,0.8)' : '2px solid transparent',
            transition:'background 0.1s',
          }}>
            {isLegal && !isCaptureLegal && (
              <div style={{width:20,height:20,borderRadius:'50%',background:'rgba(0,0,0,0.18)',pointerEvents:'none'}} />
            )}
            {isCaptureLegal && (
              <div style={{position:'absolute',inset:0,borderRadius:'50%',border:'4px solid rgba(0,0,0,0.22)',pointerEvents:'none'}} />
            )}
            {p && (
              <span style={{
                fontSize: 42, lineHeight:1, userSelect:'none', pointerEvents:'none',
                filter: p.color==='white'
                  ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))'
                  : 'drop-shadow(0 1px 1px rgba(255,255,255,0.3))',
                color: p.color==='white' ? '#fff' : '#1a0a00',
                WebkitTextStroke: p.color==='white' ? '0.8px #555' : '0.5px #000',
              }}>
                {UNICODE[p.type]}
              </span>
            )}
            {col===0 && <span style={{position:'absolute',top:2,left:3,fontSize:10,fontWeight:500,color:isLight?'#B58863':'#F0D9B5',lineHeight:1}}>{rankLabels[row]}</span>}
            {row===7 && <span style={{position:'absolute',bottom:2,right:3,fontSize:10,fontWeight:500,color:isLight?'#B58863':'#F0D9B5',lineHeight:1}}>{fileLabels[col]}</span>}
          </div>
        );
      }
    }
    return squares;
  }

  const opp = turn==='white'?'black':'white';
  const kEntry = Object.entries(pieces).find(([,p]) => p.type.toLowerCase()==='k' && p.color===turn);
  const inCheck = kEntry && isSqAttacked(pieces, unkey(kEntry[0]), opp, enPassantSq);

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'1.5rem 0',gap:16}}>
      <h2 className="sr-only">Chess game</h2>

      <div style={{display:'flex',alignItems:'center',gap:24,marginBottom:4}}>
        <div style={{width:10,height:10,borderRadius:'50%',background:status?'#ccc':(aiThinking?'#f59e0b':'#22c55e'),flexShrink:0}} />
        <span style={{fontSize:14,color:'var(--color-text-secondary)',minWidth:180,textAlign:'center'}}>
          {status || (aiThinking ? 'AI is thinking…' : (inCheck ? `${turn} is in check!` : `${turn.charAt(0).toUpperCase()+turn.slice(1)}'s turn`))}
        </span>
        <button onClick={()=>{setMode(null);setStatus(null);}} style={{fontSize:12,padding:'4px 10px',cursor:'pointer',border:'0.5px solid var(--color-border-secondary)',borderRadius:'var(--border-radius-md)',background:'transparent',color:'var(--color-text-secondary)'}}>
          New game
        </button>
      </div>

      <div style={{position:'relative',width:boardSize,height:boardSize,border:'2px solid #7c5b3a',borderRadius:4,overflow:'hidden',boxShadow:'0 4px 24px rgba(0,0,0,0.18)'}}>
        <div style={{display:'grid',gridTemplateColumns:`repeat(8, ${sqSize}px)`,gridTemplateRows:`repeat(8, ${sqSize}px)`}}>
          {renderSquares()}
        </div>

        {promotionPending && (
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10}}>
            <div style={{background:'var(--color-background-primary)',borderRadius:'var(--border-radius-lg)',padding:20,display:'flex',gap:12,border:'0.5px solid var(--color-border-tertiary)'}}>
              {['q','r','b','n'].map(t => {
                const dispType = turn==='white' ? t.toUpperCase() : t;
                return (
                  <div key={t} onClick={()=>handlePromotion(t)} style={{width:54,height:54,display:'flex',alignItems:'center',justifyContent:'center',fontSize:38,cursor:'pointer',borderRadius:'var(--border-radius-md)',border:'0.5px solid var(--color-border-secondary)',background:'var(--color-background-secondary)'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--color-background-primary)'}
                    onMouseLeave={e=>e.currentTarget.style.background='var(--color-background-secondary)'}
                  >
                    <span style={{color:turn==='white'?'#fff':'#1a0a00',WebkitTextStroke:turn==='white'?'0.8px #555':'0.5px #000',filter:turn==='white'?'drop-shadow(0 1px 2px rgba(0,0,0,0.5))':'drop-shadow(0 1px 1px rgba(255,255,255,0.3))'}}>
                      {UNICODE[dispType]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div style={{width:boardSize,maxHeight:100,overflowY:'auto',display:'flex',flexWrap:'wrap',gap:4,padding:'8px 0'}}>
          {history.map((h,i) => (
            <span key={i} style={{fontSize:12,padding:'2px 7px',borderRadius:'var(--border-radius-md)',background:'var(--color-background-secondary)',color:'var(--color-text-secondary)',border:'0.5px solid var(--color-border-tertiary)',fontFamily:'var(--font-mono)'}}>
              {Math.floor(i/2)+1}{h.color==='white'?'.':'…'} {h.str}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

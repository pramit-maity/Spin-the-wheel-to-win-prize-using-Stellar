// ════════════════════════════════════════════════════════
// PRIZES — defined server-side so the client can NEVER
// manipulate what they win. The frontend only shows the
// result after this file decides it.
// ════════════════════════════════════════════════════════

const PRIZES = [
  { label: '0.5× XLM',  mult: 0.5,  color: '#ff6b35', prob: 0.18, win: true  },
  { label: 'TRY AGAIN', mult: 0,    color: '#1a1a35', prob: 0.22, win: false },
  { label: '2× XLM',    mult: 2,    color: '#6c3fff', prob: 0.13, win: true  },
  { label: 'TRY AGAIN', mult: 0,    color: '#0d0d20', prob: 0.20, win: false },
  { label: '5× XLM',    mult: 5,    color: '#00c4ee', prob: 0.09, win: true  },
  { label: '1.5× XLM',  mult: 1.5,  color: '#ff2d78', prob: 0.07, win: true  },
  { label: 'JACKPOT',   mult: 10,   color: '#ffd700', prob: 0.01, win: true  },
  { label: 'TRY AGAIN', mult: 0,    color: '#111130', prob: 0.12, win: false },
  { label: '3× XLM',    mult: 3,    color: '#00ff9d', prob: 0.08, win: true  },
  { label: 'TRY AGAIN', mult: 0,    color: '#0a0a22', prob: 0.13, win: false },
  { label: '1× XLM',    mult: 1,    color: '#7b3fff', prob: 0.12, win: true  },
  { label: 'TRY AGAIN', mult: 0,    color: '#0d0d1a', prob: 0.15, win: false },
];

// Validate probabilities sum to ~1
const total = PRIZES.reduce((s, p) => s + p.prob, 0);
if (Math.abs(total - 1) > 0.01) {
  throw new Error(`Prize probabilities sum to ${total}, must equal 1.0`);
}

function pickPrize() {
  const r = Math.random();
  let cumulative = 0;
  for (const prize of PRIZES) {
    cumulative += prize.prob;
    if (r <= cumulative) return prize;
  }
  return PRIZES[PRIZES.length - 1];
}

// Return the index of a prize by label — used by frontend
// to know where the wheel should stop visually
function prizeIndex(label) {
  return PRIZES.findIndex(p => p.label === label);
}

module.exports = { PRIZES, pickPrize, prizeIndex };

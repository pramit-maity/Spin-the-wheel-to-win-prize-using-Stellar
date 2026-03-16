// ════════════════════════════════════════════════════════
// db.js — SQLite database using better-sqlite3
// Stores:
//  - processed transactions (replay attack protection)
//  - spin history for stats
// ════════════════════════════════════════════════════════
const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'stellarspin.db');
const db      = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// ── CREATE TABLES
db.exec(`
  CREATE TABLE IF NOT EXISTS processed_txs (
    tx_hash    TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS spins (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    bet_tx_hash      TEXT NOT NULL,
    payout_tx_hash   TEXT,
    player_address   TEXT NOT NULL,
    bet_amount       REAL NOT NULL,
    prize_label      TEXT NOT NULL,
    prize_multiplier REAL NOT NULL,
    payout_amount    REAL NOT NULL DEFAULT 0,
    created_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_spins_player ON spins(player_address);
  CREATE INDEX IF NOT EXISTS idx_spins_date   ON spins(created_at);
`);

// ── PROCESSED TX HELPERS (replay attack protection)
const processedTxs = {
  has(txHash) {
    const row = db.prepare('SELECT 1 FROM processed_txs WHERE tx_hash = ?').get(txHash);
    return !!row;
  },
  add(txHash) {
    db.prepare('INSERT OR IGNORE INTO processed_txs (tx_hash) VALUES (?)').run(txHash);
  },
};

// ── LOG A SPIN
function logSpin({ betTxHash, payoutTxHash, playerAddress, betAmount, prizeLabel, prizeMultiplier, payout }) {
  db.prepare(`
    INSERT INTO spins (bet_tx_hash, payout_tx_hash, player_address, bet_amount, prize_label, prize_multiplier, payout_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(betTxHash, payoutTxHash || null, playerAddress, betAmount, prizeLabel, prizeMultiplier, payout);
}

// ── GET GLOBAL STATS
function getStats() {
  const totalSpins   = db.prepare('SELECT COUNT(*) as c FROM spins').get().c;
  const totalBet     = db.prepare('SELECT COALESCE(SUM(bet_amount),0) as s FROM spins').get().s;
  const totalPayout  = db.prepare('SELECT COALESCE(SUM(payout_amount),0) as s FROM spins').get().s;
  const totalWins    = db.prepare('SELECT COUNT(*) as c FROM spins WHERE payout_amount > 0').get().c;
  const biggestWin   = db.prepare('SELECT MAX(payout_amount) as m FROM spins').get().m;
  const recentSpins  = db.prepare(`
    SELECT player_address, bet_amount, prize_label, payout_amount, created_at
    FROM spins ORDER BY created_at DESC LIMIT 10
  `).all();

  return {
    totalSpins,
    totalBetXLM:    parseFloat(totalBet.toFixed(4)),
    totalPayoutXLM: parseFloat(totalPayout.toFixed(4)),
    houseEdgeXLM:   parseFloat((totalBet - totalPayout).toFixed(4)),
    winRate:        totalSpins > 0 ? parseFloat((totalWins / totalSpins * 100).toFixed(1)) : 0,
    biggestWinXLM:  parseFloat((biggestWin || 0).toFixed(4)),
    recentSpins,
  };
}

module.exports = { processedTxs, logSpin, getStats };

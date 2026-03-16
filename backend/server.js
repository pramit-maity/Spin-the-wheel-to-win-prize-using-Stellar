require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { StellarSdk, server: horizonServer } = require('./stellar');
const { verifyPayment, sendPayout } = require('./payout');
const { pickPrize }  = require('./prizes');
const { logSpin }    = require('./db');

const app = express();

// ── SECURITY MIDDLEWARE
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://localhost:3000',
  methods: ['POST', 'GET'],
}));
app.use(express.json());

// ── RATE LIMIT: max 10 spin requests per minute per IP
const spinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, slow down.' },
});

// ════════════════════════════════════════════════════════
// POST /api/spin
// Body: { txHash, playerAddress, betAmount }
//
// Flow:
//  1. Verify the bet tx actually landed on-chain
//  2. Check we haven't already processed this tx (replay protection)
//  3. Pick prize server-side
//  4. Send payout if player won
//  5. Return result to frontend
// ════════════════════════════════════════════════════════
app.post('/api/spin', spinLimiter, async (req, res) => {
  const { txHash, playerAddress, betAmount } = req.body;

  // Basic input validation
  if (!txHash || !playerAddress || !betAmount) {
    return res.status(400).json({ error: 'Missing required fields: txHash, playerAddress, betAmount' });
  }

  const bet = parseFloat(betAmount);
  if (isNaN(bet) || bet < 0.1) {
    return res.status(400).json({ error: 'Invalid bet amount. Minimum is 0.1 XLM.' });
  }

  try {
    // ── STEP 1: Verify payment on-chain
    const verification = await verifyPayment(txHash, playerAddress, bet);
    if (!verification.valid) {
      return res.status(400).json({ error: verification.reason });
    }

    // ── STEP 2: Pick prize (server-side, not manipulable by client)
    const prize = pickPrize();
    console.log(`[SPIN] Player: ${playerAddress.slice(0,8)}… | Bet: ${bet} XLM | Prize: ${prize.label} (${prize.mult}x)`);

    // ── STEP 3: Send payout if player won
    let payoutTxHash = null;
    if (prize.mult > 0) {
      const winAmount = (bet * prize.mult).toFixed(7);
      console.log(`[PAYOUT] Sending ${winAmount} XLM to ${playerAddress.slice(0,8)}…`);
      payoutTxHash = await sendPayout(playerAddress, winAmount, prize.label);
      console.log(`[PAYOUT] TX: ${payoutTxHash}`);
    }

    // ── STEP 4: Log to DB
    await logSpin({
      betTxHash:    txHash,
      payoutTxHash,
      playerAddress,
      betAmount:    bet,
      prizeLabel:   prize.label,
      prizeMultiplier: prize.mult,
      payout:       prize.mult > 0 ? parseFloat((bet * prize.mult).toFixed(7)) : 0,
    });

    // ── STEP 5: Respond to frontend
    return res.json({
      success:      true,
      prize:        prize,
      payout:       prize.mult > 0 ? parseFloat((bet * prize.mult).toFixed(7)) : 0,
      payoutTxHash,
    });

  } catch (err) {
    console.error('[ERROR /api/spin]', err.message);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ── GET /api/stats — public game stats
app.get('/api/stats', async (req, res) => {
  const { getStats } = require('./db');
  const stats = await getStats();
  return res.json(stats);
});

// ── GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', network: process.env.STELLAR_NETWORK || 'testnet' });
});

// ── START
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀 StellarSpin backend running on port ${PORT}`);
  console.log(`   Network  : ${process.env.STELLAR_NETWORK || 'testnet'}`);
  console.log(`   House    : ${process.env.HOUSE_PUBLIC_KEY?.slice(0,8)}…\n`);
});

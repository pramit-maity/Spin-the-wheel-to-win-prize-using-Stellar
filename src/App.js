import { useState, useRef, useEffect, useCallback } from 'react';
import {
  isConnected,
  getPublicKey,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api';
import * as StellarSdk from '@stellar/stellar-sdk';
import './App.css';

// ── CONFIG ────────────────────────────────────────────────────────────────────
const BACKEND_URL        = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
const HOUSE_ADDRESS      = process.env.REACT_APP_HOUSE_ADDRESS || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const NETWORK_PASSPHRASE = process.env.REACT_APP_NETWORK === 'mainnet'
  ? StellarSdk.Networks.PUBLIC
  : StellarSdk.Networks.TESTNET;
const HORIZON_URL        = process.env.REACT_APP_NETWORK === 'mainnet'
  ? 'https://horizon.stellar.org'
  : 'https://horizon-testnet.stellar.org';

// ── PRIZES (visual only — actual prize decided by backend) ────────────────────
const PRIZES = [
  { label: '0.5× XLM',  mult: 0.5,  color: '#ff6b35' },
  { label: 'TRY AGAIN', mult: 0,    color: '#1a1a35' },
  { label: '2× XLM',    mult: 2,    color: '#6c3fff' },
  { label: 'TRY AGAIN', mult: 0,    color: '#0d0d20' },
  { label: '5× XLM',    mult: 5,    color: '#00c4ee' },
  { label: '1.5× XLM',  mult: 1.5,  color: '#ff2d78' },
  { label: 'JACKPOT',   mult: 10,   color: '#ffd700' },
  { label: 'TRY AGAIN', mult: 0,    color: '#111130' },
  { label: '3× XLM',    mult: 3,    color: '#00ff9d' },
  { label: 'TRY AGAIN', mult: 0,    color: '#0a0a22' },
  { label: '1× XLM',    mult: 1,    color: '#7b3fff' },
  { label: 'TRY AGAIN', mult: 0,    color: '#0d0d1a' },
];

const SLICE_ANGLE = 360 / PRIZES.length;

function shortenKey(key) {
  return key ? `${key.slice(0, 6)}…${key.slice(-4)}` : '';
}

function lightenColor(hex, amt) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
  return `rgb(${Math.min(255, (n >> 16) + amt)},${Math.min(255, ((n >> 8) & 0xff) + amt)},${Math.min(255, (n & 0xff) + amt)})`;
}

// ── WHEEL CANVAS ──────────────────────────────────────────────────────────────
function SpinWheel({ rotation, isSpinning }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const size   = canvas.width;
    const cx = size / 2, cy = size / 2;
    const radius = cx - 8;

    ctx.clearRect(0, 0, size, size);

    // Glow ring
    const ringGrad = ctx.createRadialGradient(cx, cy, radius - 8, cx, cy, radius + 14);
    ringGrad.addColorStop(0, 'rgba(108,63,255,0.5)');
    ringGrad.addColorStop(0.5, 'rgba(0,229,255,0.2)');
    ringGrad.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(cx, cy, radius + 8, 0, 2 * Math.PI);
    ctx.strokeStyle = ringGrad; ctx.lineWidth = 20; ctx.stroke();

    PRIZES.forEach((prize, i) => {
      const sa   = ((i * SLICE_ANGLE - 90 + rotation) * Math.PI) / 180;
      const ea   = (((i + 1) * SLICE_ANGLE - 90 + rotation) * Math.PI) / 180;
      const midA = (sa + ea) / 2;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, sa, ea);
      ctx.closePath();

      const grad = ctx.createLinearGradient(
        cx + radius * 0.3 * Math.cos(midA), cy + radius * 0.3 * Math.sin(midA),
        cx + radius * Math.cos(midA),       cy + radius * Math.sin(midA)
      );
      grad.addColorStop(0, lightenColor(prize.color, 30));
      grad.addColorStop(1, prize.color);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(midA);
      ctx.textAlign = 'right';
      ctx.fillStyle = prize.mult > 0 ? '#ffffff' : 'rgba(255,255,255,0.3)';
      ctx.shadowColor = prize.color; ctx.shadowBlur = prize.mult > 0 ? 10 : 0;
      const fs = prize.label === 'JACKPOT' ? 13 : prize.label === 'TRY AGAIN' ? 9 : 11;
      ctx.font = `bold ${fs}px 'Share Tech Mono', monospace`;
      ctx.fillText(prize.label, radius - 14, 4.5);
      ctx.restore();
    });

    // Rim
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(108,63,255,0.45)'; ctx.lineWidth = 3; ctx.stroke();

    // Hub
    const hub = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
    hub.addColorStop(0, '#2a0a6e'); hub.addColorStop(1, '#0a0a20');
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, 2 * Math.PI);
    ctx.fillStyle = hub; ctx.fill();
    ctx.strokeStyle = '#6c3fff'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0,229,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();

    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00e5ff'; ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 18;
    ctx.fillText('✦', cx, cy); ctx.shadowBlur = 0;

  }, [rotation]);

  return (
    <canvas
      ref={canvasRef}
      width={420} height={420}
      className={`wheel-canvas ${isSpinning ? 'spinning-glow' : ''}`}
    />
  );
}

// ── PARTICLES ─────────────────────────────────────────────────────────────────
function Particles({ active, color }) {
  if (!active) return null;
  return (
    <div className="particles">
      {Array.from({ length: 28 }, (_, i) => (
        <div key={i} className="particle" style={{ '--angle': `${(i / 28) * 360}deg`, '--color': color, '--delay': `${(i % 7) * 50}ms` }} />
      ))}
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [walletKey,  setWalletKey]  = useState(null);
  const [balance,    setBalance]    = useState(null);
  const [betAmount,  setBetAmount]  = useState('1');
  const [rotation,   setRotation]   = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [gameStatus, setGameStatus] = useState('idle');
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState('');
  const [txLog,      setTxLog]      = useState([]);
  const [particles,  setParticles]  = useState(false);
  const rotRef = useRef(0);

  const fetchBalance = useCallback(async (key) => {
    try {
      const stellarServer = new StellarSdk.Horizon.Server(HORIZON_URL);
      const acct = await stellarServer.loadAccount(key);
      const xlm  = acct.balances.find(b => b.asset_type === 'native');
      setBalance(parseFloat(xlm?.balance || 0).toFixed(2));
    } catch { setBalance('—'); }
  }, []);

  const connectWallet = async () => {
    setError('');
    try {
      const connected = await isConnected();
      if (!connected) throw new Error('Freighter extension not found. Install it from freighter.app');
      await requestAccess();
      const key = await getPublicKey();
      setWalletKey(key);
      fetchBalance(key);
    } catch (e) { setError(e.message); }
  };

  const disconnectWallet = () => {
    setWalletKey(null); setBalance(null); setResult(null);
    setGameStatus('idle'); setError('');
  };

  const doSpin = async () => {
    if (isSpinning || !walletKey) return;
    const bet = parseFloat(betAmount);
    if (isNaN(bet) || bet < 0.1) { setError('Minimum bet is 0.1 XLM'); return; }

    setError(''); setResult(null); setParticles(false);
    setGameStatus('paying');

    // STEP 1: Submit bet tx on-chain
    let txHash;
    try {
      const stellarServer = new StellarSdk.Horizon.Server(HORIZON_URL);
      const account = await stellarServer.loadAccount(walletKey);
      const fee     = await stellarServer.fetchBaseFee();
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: fee.toString(), networkPassphrase: NETWORK_PASSPHRASE,
      })
      .addOperation(StellarSdk.Operation.payment({
        destination: HOUSE_ADDRESS,
        asset:       StellarSdk.Asset.native(),
        amount:      bet.toFixed(7),
      }))
      .addMemo(StellarSdk.Memo.text('StellarSpin'))
      .setTimeout(30)
      .build();

      const signed   = await signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
      const signedTx = StellarSdk.TransactionBuilder.fromXDR(signed, NETWORK_PASSPHRASE);
      const txResult = await stellarServer.submitTransaction(signedTx);
      txHash = txResult.hash;
    } catch (e) {
      const msg = e?.response?.data?.extras?.result_codes?.transaction || e.message;
      setError('Transaction failed: ' + msg);
      setGameStatus('idle'); return;
    }

    // STEP 2: Backend verifies tx, picks prize, sends payout
    setGameStatus('waiting');
    let prizeData;
    try {
      const res = await fetch(`${BACKEND_URL}/api/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash, playerAddress: walletKey, betAmount: bet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Backend error');
      prizeData = data;
    } catch (e) {
      setError('Backend error: ' + e.message);
      setGameStatus('idle'); return;
    }

    // STEP 3: Animate wheel to land on server-chosen prize
    setGameStatus('spinning');
    setIsSpinning(true);

    const prizeIndex  = PRIZES.findIndex(p => p.label === prizeData.prize.label);
    const safeIndex   = prizeIndex >= 0 ? prizeIndex : 1;
    const targetSlice = safeIndex * SLICE_ANGLE + SLICE_ANGLE / 2;
    const extraSpins  = 360 * (7 + Math.floor(Math.random() * 4));
    const currentMod  = rotRef.current % 360;
    const needed      = (360 - currentMod - targetSlice + 360) % 360;
    const newRot      = rotRef.current + extraSpins + needed;
    rotRef.current    = newRot;
    setRotation(newRot);

    setTimeout(() => {
      setIsSpinning(false);
      setGameStatus('done');
      setParticles(prizeData.payout > 0);
      setResult({
        label:        prizeData.prize.label,
        color:        prizeData.prize.color || PRIZES[safeIndex].color,
        payout:       prizeData.payout,
        payoutTxHash: prizeData.payoutTxHash,
        bet,
      });
      setTxLog(prev => [{ time: new Date().toLocaleTimeString(), bet: bet.toFixed(2), label: prizeData.prize.label, payout: prizeData.payout }, ...prev.slice(0, 4)]);
      fetchBalance(walletKey);
    }, 4800);
  };

  const isBusy = isSpinning || ['paying','waiting','spinning'].includes(gameStatus);

  const spinBtnLabel = () => {
    if (gameStatus === 'paying')   return <><span className="spinner-sm" /> SUBMITTING TX…</>;
    if (gameStatus === 'waiting')  return <><span className="spinner-sm" /> VERIFYING…</>;
    if (gameStatus === 'spinning') return <><span className="spinner-sm spin-fast" /> SPINNING…</>;
    return '⚡ SPIN THE WHEEL';
  };

  return (
    <div className="app-root">
      <div className="bg-grid" /><div className="bg-glow" />

      {/* HEADER */}
      <header className="header">
        <div className="logo-mark">
          <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
            <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" stroke="#6c3fff" strokeWidth="1.5" fill="none" opacity="0.6"/>
            <polygon points="20,7 31,13.5 31,26.5 20,33 9,26.5 9,13.5" stroke="#00e5ff" strokeWidth="1" fill="rgba(108,63,255,0.1)"/>
            <text x="20" y="25" textAnchor="middle" fontSize="14" fill="#6c3fff" fontFamily="monospace">✦</text>
          </svg>
          <div>
            <div className="logo-text">STELLAR<em>SPIN</em></div>
            <div className="logo-sub">BLOCKCHAIN WHEEL OF FORTUNE</div>
          </div>
        </div>
        <div className="header-right">
          {walletKey ? (
            <div className="wallet-chip">
              <span className="wallet-dot" />
              <span className="wallet-addr">{shortenKey(walletKey)}</span>
              {balance !== null && <span className="wallet-balance">{balance} XLM</span>}
              <button className="btn-disconnect" onClick={disconnectWallet}>✕</button>
            </div>
          ) : (
            <button className="btn-connect" onClick={connectWallet}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>
              CONNECT FREIGHTER
            </button>
          )}
        </div>
      </header>

      {/* MAIN */}
      <main className="main">

        {/* LEFT */}
        <section className="panel-left">
          <div className="panel">
            <div className="panel-title">Prize Table</div>
            {PRIZES.filter(p => p.mult > 0).map((p, i) => (
              <div key={i} className="prize-row">
                <span className="p-dot" style={{ background: p.color, boxShadow: `0 0 6px ${p.color}` }} />
                <span className="p-name" style={p.mult >= 10 ? { color: 'var(--gold)' } : {}}>{p.label}</span>
              </div>
            ))}
          </div>
          {txLog.length > 0 && (
            <div className="panel">
              <div className="panel-title">Recent Spins</div>
              {txLog.map((t, i) => (
                <div key={i} className="tx-row">
                  <span className="tx-time">{t.time}</span>
                  <span className="tx-bet">{t.bet} XLM</span>
                  <span className={`tx-result ${t.payout > 0 ? 'tx-win' : 'tx-loss'}`}>
                    {t.payout > 0 ? `+${t.payout} XLM` : t.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* CENTER */}
        <section className="panel-center">
          <div className="wheel-wrapper">
            <div className="wheel-pointer">▼</div>
            <SpinWheel rotation={rotation} isSpinning={isSpinning} />
            <Particles active={particles} color={result?.color} />
          </div>

          {walletKey ? (
            <div className="controls">
              <div className="bet-panel">
                <div className="bet-label">BET AMOUNT</div>
                <div className="bet-row-input">
                  <button className="bet-adj" onClick={() => setBetAmount(v => Math.max(0.1, parseFloat(v) - 0.5).toFixed(1))} disabled={isBusy}>−</button>
                  <input className="bet-input" type="number" min="0.1" step="0.5" value={betAmount} onChange={e => setBetAmount(e.target.value)} disabled={isBusy} />
                  <span className="bet-unit">XLM</span>
                  <button className="bet-adj" onClick={() => setBetAmount(v => (parseFloat(v) + 0.5).toFixed(1))} disabled={isBusy}>+</button>
                </div>
                <div className="presets">
                  {['0.5','1','2','5'].map(v => (
                    <button key={v} className={`preset-btn ${betAmount === v ? 'active' : ''}`} onClick={() => setBetAmount(v)} disabled={isBusy}>{v}</button>
                  ))}
                </div>
                <button className={`btn-spin ${isBusy ? 'btn-spin--busy' : ''}`} onClick={doSpin} disabled={isBusy}>
                  {spinBtnLabel()}
                </button>
              </div>
              {error && <div className="error-msg">⚠ {error}</div>}
            </div>
          ) : (
            <div className="connect-prompt">
              <p>Connect your Freighter wallet to play</p>
              <button className="btn-connect btn-connect--lg" onClick={connectWallet}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>
                CONNECT FREIGHTER WALLET
              </button>
              {error && <div className="error-msg" style={{ marginTop: 12 }}>⚠ {error}</div>}
            </div>
          )}
        </section>

        {/* RIGHT */}
        <section className="panel-right">
          {result ? (
            <div className={`result-card ${result.payout > 0 ? (result.payout >= result.bet * 10 ? 'result-jackpot' : 'result-win') : 'result-loss'}`}>
              <div className="result-icon">{result.payout >= result.bet * 10 ? '🏆' : result.payout > 0 ? '🎉' : '💀'}</div>
              <div className="result-title" style={result.payout > 0 ? { color: result.color } : {}}>
                {result.payout > 0 ? (result.payout >= result.bet * 10 ? 'JACKPOT!' : 'YOU WON') : result.label}
              </div>
              {result.payout > 0 && <div className="result-amount" style={{ color: result.color }}>{result.payout} <span>XLM</span></div>}
              <div className="result-bet">Bet: {result.bet} XLM</div>
              {result.payoutTxHash && (
                <a className="result-tx-link" href={`https://stellar.expert/explorer/testnet/tx/${result.payoutTxHash}`} target="_blank" rel="noopener noreferrer">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  View Payout TX on Explorer
                </a>
              )}
              <p className="result-note">{result.payout > 0 ? 'Winnings sent to your wallet ✓' : 'Better luck next time!'}</p>
            </div>
          ) : (
            <div className="panel how-to">
              <div className="panel-title">How To Play</div>
              <ol className="how-steps">
                <li><span className="step-num">01</span>Install Freighter browser extension</li>
                <li><span className="step-num">02</span>Fund wallet at friendbot.stellar.org</li>
                <li><span className="step-num">03</span>Connect wallet &amp; choose your bet</li>
                <li><span className="step-num">04</span>Hit SPIN — bet sent on-chain &amp; verified</li>
                <li><span className="step-num">05</span>Backend picks prize &amp; pays out instantly</li>
              </ol>
              <div className="network-badge"><span className="net-dot" />STELLAR TESTNET</div>
            </div>
          )}
          <div className="panel stats-panel">
            <div className="panel-title">Game Info</div>
            <div className="stat-row"><span className="stat-k">MAX WIN</span><span className="stat-v" style={{ color:'var(--gold)' }}>10× BET</span></div>
            <div className="stat-row"><span className="stat-k">MIN BET</span><span className="stat-v">0.1 XLM</span></div>
            <div className="stat-row"><span className="stat-k">JACKPOT</span><span className="stat-v" style={{ color:'var(--gold)' }}>1% CHANCE</span></div>
            <div className="stat-row"><span className="stat-k">PAYOUT</span><span className="stat-v" style={{ color:'var(--green)' }}>INSTANT</span></div>
            <div className="stat-row"><span className="stat-k">NETWORK</span><span className="stat-v">TESTNET</span></div>
          </div>
        </section>
      </main>
    </div>
  );
}

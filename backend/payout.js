const { StellarSdk, server, NETWORK_PASSPHRASE } = require('./stellar');
const { processedTxs } = require('./db');

const HOUSE_PUBLIC_KEY  = process.env.HOUSE_PUBLIC_KEY;
const HOUSE_SECRET_KEY  = process.env.HOUSE_SECRET_KEY;

// ════════════════════════════════════════════════════════
// verifyPayment
// Checks that a given txHash:
//  1. Actually exists on the Stellar ledger
//  2. Has a payment operation sending XLM to the house wallet
//  3. Came FROM the expected player address
//  4. Amount matches what the frontend claimed
//  5. Has NOT been processed before (replay attack protection)
// ════════════════════════════════════════════════════════
async function verifyPayment(txHash, playerAddress, claimedBet) {
  if (!HOUSE_PUBLIC_KEY) {
    throw new Error('HOUSE_PUBLIC_KEY not set in environment');
  }

  // Replay protection — check DB first before hitting Horizon
  const alreadyProcessed = await processedTxs.has(txHash);
  if (alreadyProcessed) {
    return { valid: false, reason: 'Transaction already used for a spin.' };
  }

  // Fetch the transaction from Horizon
  let tx;
  try {
    tx = await server.transactions().transaction(txHash).call();
  } catch (e) {
    return { valid: false, reason: 'Transaction not found on the network. Try again in a few seconds.' };
  }

  // Parse all operations in the transaction
  let ops;
  try {
    const opsPage = await server.operations().forTransaction(txHash).call();
    ops = opsPage.records;
  } catch (e) {
    return { valid: false, reason: 'Could not read transaction operations.' };
  }

  // Find a payment op that:
  //  - is a native (XLM) payment
  //  - goes TO the house wallet
  //  - comes FROM the player
  //  - amount matches the claimed bet (within 0.01 XLM tolerance)
  const paymentOp = ops.find(op =>
    op.type === 'payment' &&
    op.asset_type === 'native' &&
    op.to === HOUSE_PUBLIC_KEY &&
    op.from === playerAddress &&
    Math.abs(parseFloat(op.amount) - claimedBet) < 0.01
  );

  if (!paymentOp) {
    return {
      valid: false,
      reason: `No valid payment found. Expected ${claimedBet} XLM from ${playerAddress.slice(0,8)}… to house wallet.`,
    };
  }

  // Mark as processed immediately to prevent race conditions
  await processedTxs.add(txHash);

  return { valid: true, amount: parseFloat(paymentOp.amount) };
}

// ════════════════════════════════════════════════════════
// sendPayout
// Sends winnings from the house wallet back to the player.
// Uses the HOUSE_SECRET_KEY stored securely in .env
// ════════════════════════════════════════════════════════
async function sendPayout(playerAddress, amount, prizeLabel) {
  if (!HOUSE_SECRET_KEY) {
    throw new Error('HOUSE_SECRET_KEY not set in environment');
  }

  const houseKeypair = StellarSdk.Keypair.fromSecret(HOUSE_SECRET_KEY);

  // Verify the house key matches the public key we expect
  if (houseKeypair.publicKey() !== HOUSE_PUBLIC_KEY) {
    throw new Error('HOUSE_SECRET_KEY does not match HOUSE_PUBLIC_KEY');
  }

  // Load house account from ledger (need current sequence number)
  const houseAccount = await server.loadAccount(HOUSE_PUBLIC_KEY);
  const fee = await server.fetchBaseFee();

  // Build payout transaction
  const tx = new StellarSdk.TransactionBuilder(houseAccount, {
    fee: fee.toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
  .addOperation(
    StellarSdk.Operation.payment({
      destination: playerAddress,
      asset:       StellarSdk.Asset.native(),
      amount:      amount,
    })
  )
  .addMemo(StellarSdk.Memo.text(`StellarSpin-${prizeLabel.replace(/\s/g,'')}`))
  .setTimeout(30)
  .build();

  // Sign with house wallet secret key (server-side, never exposed to client)
  tx.sign(houseKeypair);

  // Submit to Stellar network
  const result = await server.submitTransaction(tx);
  return result.hash;
}

module.exports = { verifyPayment, sendPayout };

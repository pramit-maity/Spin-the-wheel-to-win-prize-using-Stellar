const StellarSdk = require('@stellar/stellar-sdk');

const isMainnet = process.env.STELLAR_NETWORK === 'mainnet';

const HORIZON_URL = isMainnet
  ? 'https://horizon.stellar.org'
  : 'https://horizon-testnet.stellar.org';

const NETWORK_PASSPHRASE = isMainnet
  ? StellarSdk.Networks.PUBLIC
  : StellarSdk.Networks.TESTNET;

const server = new StellarSdk.Horizon.Server(HORIZON_URL);

module.exports = { StellarSdk, server, NETWORK_PASSPHRASE, HORIZON_URL };

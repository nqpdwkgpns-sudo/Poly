// Polygon network contract addresses
export const POLYGON_CHAIN_ID = 137;

// Polymarket CTF Exchange (Conditional Token Framework)
export const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

// Polymarket USDC on Polygon (native USDC, not bridged)
export const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Polymarket Conditional Token contract
export const CONDITIONAL_TOKEN_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

// Polymarket Neg Risk Exchange
export const NEG_RISK_EXCHANGE_ADDRESS = '0xC5d563A36AE78145C45a50134d48A1215220f80a';

// Polymarket Neg Risk Adapter
export const NEG_RISK_ADAPTER_ADDRESS = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

// USDC decimals (6 on Polygon)
export const USDC_DECIMALS = 6;

// API endpoints
export const CLOB_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

// EIP-712 domain for Polymarket CLOB orders
export const CLOB_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: POLYGON_CHAIN_ID,
  verifyingContract: CTF_EXCHANGE_ADDRESS,
};

// Order type EIP-712 struct
export const ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
};

// Trading constants
export const MIN_ORDER_SIZE_USDC = 1;
export const POLYMARKET_FEE_BPS = 20; // 0.2% taker fee
export const POLYMARKET_FEE_RATE = POLYMARKET_FEE_BPS / 10000;

// Risk constants
export const MAX_SPREAD_TO_TRADE = 0.10; // 10% max spread
export const MIN_BOOK_DEPTH_USDC = 500;   // minimum $500 depth
export const MIN_MARKET_VOLUME_24H = 10000; // $10k minimum

// Position management
export const PROFIT_TARGET_PCT = 0.15; // take profit at +15%
export const STOP_LOSS_PCT = 0.08;     // stop loss at -8%

// Timing
export const MAIN_LOOP_INTERVAL_SEC = 30;
export const POSITION_MONITOR_INTERVAL_SEC = 60;
export const RISK_MONITOR_INTERVAL_SEC = 10;
export const MIN_MARKET_EXPIRY_HOURS = 12;

// State files
export const STATE_FILE = './data/state.json';
export const POSITIONS_FILE = './data/positions.json';

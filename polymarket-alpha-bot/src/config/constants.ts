export const POLYGON_CHAIN_ID = 137;

// Polymarket / Conditional Token Framework contract addresses on Polygon
export const POLYMARKET_CONTRACTS = {
  USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  CONDITIONAL_TOKENS: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  NEG_RISK_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
} as const;

export const USDC_DECIMALS = 6;
export const PRICE_DECIMALS = 4;

// CLOB order EIP-712 domain
export const ORDER_EIP712_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: POLYGON_CHAIN_ID,
  verifyingContract: POLYMARKET_CONTRACTS.CTF_EXCHANGE,
} as const;

export const ORDER_EIP712_TYPES = {
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
} as const;

// Strategy / risk constants
export const STRATEGY_NAMES = {
  SPREAD_ARB: 'spread_arbitrage',
  LIQUIDITY_FADE: 'liquidity_fade',
  MOMENTUM_REVERSAL: 'momentum_reversal',
  NEWS_CALIBRATION: 'news_calibration',
} as const;

export const FEES_BPS = 0; // Polymarket maker/taker fee in basis points; updated as fees policy changes
export const SPREAD_ARB_THRESHOLD = 0.97; // YES + NO < 0.97 -> arb
export const LIQUIDITY_FADE_MOVE_PCT = 0.02;
export const MOMENTUM_REVERSAL_MOVE_PCT = 0.08;
export const MOMENTUM_REVERSAL_WINDOW_MS = 10 * 60 * 1000;

export const RISK_LIMITS = {
  TOP_OF_BOOK_MIN_USDC: 500,
  MIN_MARKET_HOURS_TO_EXPIRY: 12,
  CATEGORY_CONCENTRATION_PCT: 0.4,
  CONSECUTIVE_FAIL_LIMIT: 3,
  RPC_ERROR_PER_MIN_LIMIT: 10,
  CIRCUIT_BREAKER_COOLDOWN_MS: 30 * 60 * 1000,
} as const;

// Loop intervals (ms)
export const LOOP_INTERVALS = {
  SCAN_MS: 30_000,
  POSITION_MONITOR_MS: 60_000,
  RISK_MONITOR_MS: 10_000,
} as const;

// Persistence
export const DATA_DIR = 'data';
export const STATE_FILE = 'state.json';
export const POSITIONS_FILE = 'positions.json';

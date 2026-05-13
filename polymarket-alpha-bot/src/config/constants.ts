export const POLYGON_CHAIN_ID = 137;

export const ADDRESSES = {
  usdc: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  ctfExchange: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  conditionalTokens: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  negRiskAdapter: "0xc5d563a36ae78145c45f474e0a0adf47c9f8a6ff"
} as const;

export const USDC_DECIMALS = 6;
export const ONE_MINUTE_MS = 60_000;
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export const DEFAULT_LIMITS = {
  minTopBookLiquidityUsdc: 500,
  minVolume24hUsdc: 10_000,
  minTimeToExpiryMs: 24 * ONE_HOUR_MS,
  riskMinTimeToExpiryMs: 12 * ONE_HOUR_MS,
  categoryMaxConcentration: 0.4
} as const;

export const POLYMARKET_EIP712_DOMAIN = {
  name: "Polymarket CTF Exchange",
  version: "1",
  chainId: POLYGON_CHAIN_ID,
  verifyingContract: ADDRESSES.ctfExchange
} as const;

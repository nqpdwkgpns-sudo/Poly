export const POLYGON_CHAIN_ID = 137;

export const POLYMARKET_CONTRACTS = {
  USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  CONDITIONAL_TOKENS: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  CTF_EXCHANGE: '0x4bfb41d5B3570DEFd03C39a9A4D8dE6Bd8B8982E',
  NEG_RISK_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a'
} as const;

export const USDC_DECIMALS = 6;
export const ORDER_EXPIRATION_SECONDS = 60 * 5;
export const MARKET_SCAN_CRON = '*/30 * * * * *';
export const POSITION_MONITOR_CRON = '*/60 * * * * *';
export const RISK_MONITOR_CRON = '*/10 * * * * *';
export const DAILY_SUMMARY_CRON = '50 23 * * *';
export const DAILY_RESET_CRON = '0 0 * * *';

export const CLOB_EIP712_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: POLYGON_CHAIN_ID,
  verifyingContract: POLYMARKET_CONTRACTS.CTF_EXCHANGE
} as const;

export type MarketCategory =
  | 'politics'
  | 'crypto'
  | 'sports'
  | 'economics'
  | 'culture'
  | 'science'
  | 'other';

export interface MarketOutcome {
  /** Polymarket ERC-1155 token id for this outcome (string, 256-bit decimal). */
  tokenId: string;
  /** "Yes" / "No" or custom outcome label. */
  name: string;
  /** Last trade price 0..1. */
  price: number;
  /** 24h volume in USDC. */
  volume24h?: number;
}

export interface Market {
  /** Polymarket conditionId (0x-prefixed 32-byte hex). */
  conditionId: string;
  /** Gamma slug/id (numeric or slug). */
  id: string;
  question: string;
  description?: string;
  category: MarketCategory;
  endDate: string; // ISO timestamp
  /** Whether market has been resolved on-chain. */
  resolved: boolean;
  active: boolean;
  closed: boolean;
  /** Total USDC traded (lifetime). */
  volume: number;
  volume24h: number;
  liquidity: number;
  outcomes: MarketOutcome[];
  /** Convenience yes/no token ids when market is binary. */
  yesTokenId?: string;
  noTokenId?: string;
  raw?: unknown;
}

export interface OrderBookLevel {
  price: number; // 0..1
  size: number; // USDC notional at level
}

export interface OrderBook {
  tokenId: string;
  market?: string;
  asset_id?: string;
  bids: OrderBookLevel[]; // sorted desc by price
  asks: OrderBookLevel[]; // sorted asc by price
  timestamp: number;
}

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';

export interface LimitOrderParams {
  tokenId: string;
  side: OrderSide;
  price: number; // 0..1
  size: number; // USDC notional
  expirationSec?: number; // unix seconds
}

export interface SignedOrder {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: 0 | 1;
  signatureType: 0 | 1 | 2;
  signature: string;
}

export interface Order extends LimitOrderParams {
  orderId: string;
  status: 'OPEN' | 'FILLED' | 'PARTIAL' | 'CANCELLED' | 'EXPIRED' | 'REJECTED';
  filledSize: number;
  remainingSize: number;
  createdAt: number;
  updatedAt: number;
}

export interface Trade {
  tokenId: string;
  price: number;
  size: number;
  side: OrderSide;
  timestamp: number;
  taker?: string;
  maker?: string;
}

export interface Position {
  conditionId: string;
  tokenId: string;
  market: string;
  side: OrderSide;
  entryPrice: number;
  currentPrice: number;
  size: number; // USDC notional at entry
  shares: number; // outcome tokens held
  openedAt: number;
  category: MarketCategory;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface OrderState {
  order: Order;
  signature?: string;
  attempts: number;
  lastError?: string;
}

export interface PnlSnapshot {
  realized: number;
  unrealized: number;
  total: number;
  ts: number;
}

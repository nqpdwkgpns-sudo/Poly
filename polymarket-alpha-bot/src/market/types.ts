export type Side = 'BUY' | 'SELL';

export interface MarketOutcome {
  tokenId: string;
  outcome: string;  // e.g. "Yes", "No"
  price: number;    // 0–1
}

export interface Market {
  conditionId: string;
  questionId: string;
  slug: string;
  question: string;
  description: string;
  category: string;
  subcategory: string;
  outcomes: MarketOutcome[];
  endDate: string;         // ISO date
  createdAt: string;
  updatedAt: string;
  volume: number;          // total USDC volume
  volume24h: number;       // 24h USDC volume
  liquidity: number;       // available liquidity
  active: boolean;
  closed: boolean;
  archived: boolean;
  resolved: boolean;
  resolutionSource: string;
  tags: string[];
}

export interface PriceLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  tokenId: string;
  bids: PriceLevel[];  // sorted descending by price
  asks: PriceLevel[];  // sorted ascending by price
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  spread: number;
  timestamp: number;
}

export interface Order {
  id: string;
  tokenId: string;
  side: Side;
  price: number;
  size: number;
  sizeMatched: number;
  sizeRemaining: number;
  status: OrderStatus;
  makerAddress: string;
  createdAt: number;
  expiresAt: number;
}

export type OrderStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'EXPIRED';

export interface Trade {
  id: string;
  tokenId: string;
  price: number;
  size: number;
  side: Side;
  timestamp: number;
  makerOrderId: string;
  takerOrderId: string;
}

export interface LimitOrder {
  salt: bigint;
  maker: string;
  signer: string;
  taker: string;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  nonce: bigint;
  feeRateBps: bigint;
  side: number;           // 0 = BUY, 1 = SELL
  signatureType: number;  // 0 = EOA
}

export interface SignedOrder extends LimitOrder {
  signature: string;
}

export interface MarketPrice {
  tokenId: string;
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadPct: number;
}

export interface GammaMarketResponse {
  id: string;
  condition_id: string;
  question_id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  sub_category?: string;
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
  }>;
  end_date_iso: string;
  created_at: string;
  updated_at: string;
  volume: number;
  volume_24hr: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  archived: boolean;
  resolved: boolean;
  resolution_source?: string;
  tags?: string[];
}

export interface ClobOrderBookResponse {
  market: string;
  asset_id: string;
  hash: string;
  timestamp: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

export type MarketCategory =
  | 'politics'
  | 'crypto'
  | 'sports'
  | 'finance'
  | 'entertainment'
  | 'science'
  | 'other';

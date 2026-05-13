export type MarketSide = 'YES' | 'NO';
export type OrderSide = 'BUY' | 'SELL';

export interface MarketOutcome {
  name: string;
  tokenId: string;
  price?: number;
}

export interface Market {
  id: string;
  conditionId: string;
  question: string;
  slug?: string;
  category: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  resolved: boolean;
  volume24h: number;
  liquidity: number;
  outcomes: MarketOutcome[];
  tokenIds: string[];
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  tokenId: string;
  market?: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface Trade {
  id: string;
  tokenId: string;
  conditionId?: string;
  side: OrderSide;
  price: number;
  size: number;
  timestamp: number;
}

export interface MarketPrice {
  tokenId: string;
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  spread: number | null;
}

export interface LimitOrder {
  tokenId: string;
  side: OrderSide;
  price: number;
  size: number;
  expiration: number;
  nonce?: string;
  makerAddress?: string;
}

export interface PolymarketOrder {
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
  side: OrderSide;
  signatureType: number;
}

export interface SignedOrder {
  order: PolymarketOrder;
  signature: string;
}

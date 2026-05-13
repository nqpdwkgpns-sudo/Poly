export type Side = "BUY" | "SELL";

export interface MarketOutcome {
  tokenId: string;
  outcome: string;
  price?: number;
}

export interface Market {
  conditionId: string;
  slug?: string;
  question: string;
  description?: string;
  category: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  archived?: boolean;
  volume24h: number;
  liquidityNum?: number;
  outcomes: MarketOutcome[];
  tokenIds: string[];
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  tokenId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface Trade {
  tradeId: string;
  tokenId: string;
  price: number;
  size: number;
  side: Side;
  timestamp: number;
}

export interface Order {
  id: string;
  tokenId: string;
  conditionId?: string;
  side: Side;
  price: number;
  size: number;
  status: "OPEN" | "FILLED" | "CANCELLED" | "EXPIRED" | "PARTIAL";
  createdAt: number;
}

export interface LimitOrder {
  tokenId: string;
  side: Side;
  price: number;
  size: number;
  expiration: number;
}

export interface MarketPrice {
  tokenId: string;
  bestBid: number;
  bestAsk: number;
  mid: number;
  spread: number;
}

export interface WsOrderBookUpdate {
  eventType: "orderbook_update";
  tokenId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface WsTradeEvent {
  eventType: "trade";
  trade: Trade;
}

export interface WsResolvedEvent {
  eventType: "market_resolved";
  conditionId: string;
  resolvedOutcome?: string;
  timestamp: number;
}

export type WsMarketEvent = WsOrderBookUpdate | WsTradeEvent | WsResolvedEvent;

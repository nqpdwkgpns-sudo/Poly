import type { Market, OrderBook } from "../market/types.js";

export interface Signal {
  conditionId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  impliedProbability: number;
  marketProbability: number;
  edge: number;
  confidence: number;
  sizing: number;
  strategy: string;
  reason?: string;
}

export interface Strategy {
  name: string;
  analyze(market: Market, book: OrderBook): Promise<Signal | null>;
}

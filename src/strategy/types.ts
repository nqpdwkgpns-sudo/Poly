import type { Market, OrderBook, OrderSide } from '../market/types.js';

export interface Signal {
  conditionId: string;
  tokenId: string;
  marketQuestion: string;
  category: string;
  strategy: string;
  side: OrderSide;
  impliedProbability: number;
  marketProbability: number;
  edge: number;
  confidence: number;
  sizing: number;
  reason?: string;
}

export interface Strategy {
  name: string;
  analyze(market: Market, book: OrderBook): Promise<Signal | null>;
}

export interface SignalDecision extends Signal {
  approved: boolean;
  rejectionReason?: string;
  observedAt: string;
}

import { Market, OrderBook } from '../market/types';

export interface Signal {
  conditionId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  impliedProbability: number;  // our estimate
  marketProbability: number;   // what market prices imply
  edge: number;                // impliedProb - marketProb
  confidence: number;          // 0–1
  sizing: number;              // USDC amount (pre-Kelly)
  strategyName: string;
  reasoning: string;
}

export interface Strategy {
  name: string;
  analyze(market: Market, book: OrderBook): Promise<Signal | null>;
}

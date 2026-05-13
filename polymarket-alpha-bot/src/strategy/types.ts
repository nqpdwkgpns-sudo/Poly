import { Market, OrderBook, OrderSide } from '../market/types.js';

export interface Signal {
  conditionId: string;
  tokenId: string;
  side: OrderSide;
  /** Our model's estimate of the probability that this outcome resolves "YES". */
  impliedProbability: number;
  /** Market-implied probability from current order book (mid). */
  marketProbability: number;
  /** edge = impliedProbability - marketProbability, may be signed. */
  edge: number;
  /** Confidence on a 0..1 scale. */
  confidence: number;
  /** USDC amount before Kelly sizing. */
  sizing: number;
  /** Source strategy name. */
  strategy: string;
  /** Suggested limit price. */
  price: number;
  /** Optional human reasoning for the signal feed. */
  rationale?: string;
  /** Snapshot ts. */
  ts: number;
}

export interface Strategy {
  name: string;
  analyze(market: Market, book: OrderBook): Promise<Signal | null>;
}

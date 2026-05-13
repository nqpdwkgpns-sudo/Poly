import { OrderBook } from '../market/types';

export function midPrice(book: OrderBook): number {
  if (book.bestBid <= 0 && book.bestAsk >= 1) return 0.5;
  return (book.bestBid + book.bestAsk) / 2;
}

export function marketImpliedProb(book: OrderBook): number {
  // In a binary prediction market, the mid price IS the implied probability
  return midPrice(book);
}

export function spreadAdjustedProb(book: OrderBook, side: 'BUY' | 'SELL'): number {
  // When buying YES, you pay the ask; net break-even probability includes spread cost
  if (side === 'BUY') {
    return book.bestAsk > 0 ? book.bestAsk : midPrice(book);
  }
  // When selling (buying NO), break-even is 1 - bid
  return book.bestBid > 0 ? 1 - book.bestBid : 1 - midPrice(book);
}

export interface BaseRateRecord {
  category: string;
  priorProbability: number;
  sampleSize: number;
}

// Simple base rates derived from historical market resolution data
// These serve as priors when we lack better information
const BASE_RATES: Record<string, number> = {
  politics: 0.5,
  crypto: 0.45,
  sports: 0.5,
  finance: 0.48,
  entertainment: 0.5,
  science: 0.5,
  other: 0.5,
};

export function historicalBaseRate(category: string, _question: string): number {
  return BASE_RATES[category.toLowerCase()] ?? 0.5;
}

export function calibrate(rawProb: number, confidence: number): number {
  // Laplace smoothing: pull probability toward 0.5 based on confidence level
  // confidence=1 → no smoothing, confidence=0 → return 0.5
  const smoothingStrength = 1 - confidence;
  return rawProb * confidence + 0.5 * smoothingStrength;
}

export function expectedValue(
  impliedProb: number,
  marketProb: number,
  odds = 1.0
): number {
  // EV = p * (odds - 1) - (1 - p) * 1
  return impliedProb * odds - (1 - impliedProb);
}

export function kellyFraction(edge: number, odds: number): number {
  if (edge <= 0 || odds <= 0) return 0;
  // Kelly formula: f = (p * odds - (1-p)) / odds = edge / odds
  return edge / odds;
}

export function spreadCost(book: OrderBook): number {
  return book.spread / 2; // round-trip cost is the full spread, one-way is half
}

export function bookDepthAtPrice(book: OrderBook, side: 'BUY' | 'SELL', targetPrice: number): number {
  if (side === 'BUY') {
    return book.asks
      .filter((a) => a.price <= targetPrice)
      .reduce((sum, a) => sum + a.price * a.size, 0);
  }
  return book.bids
    .filter((b) => b.price >= targetPrice)
    .reduce((sum, b) => sum + b.price * b.size, 0);
}

export function bestBidDepthUsdc(book: OrderBook): number {
  return book.bids.slice(0, 3).reduce((sum, b) => sum + b.price * b.size, 0);
}

export function bestAskDepthUsdc(book: OrderBook): number {
  return book.asks.slice(0, 3).reduce((sum, a) => sum + a.price * a.size, 0);
}

import type { OrderBook } from '../market/types.js';

export function midPrice(book: OrderBook): number | null {
  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  if (bestBid === undefined || bestAsk === undefined) return null;
  return (bestBid + bestAsk) / 2;
}

export function marketImpliedProb(book: OrderBook): number | null {
  const mid = midPrice(book);
  return mid === null ? null : clampProbability(mid);
}

export function spreadAdjustedProb(book: OrderBook): number | null {
  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  if (bestBid === undefined || bestAsk === undefined) return null;
  const spread = Math.max(0, bestAsk - bestBid);
  return clampProbability((bestBid + bestAsk) / 2 + spread / 2);
}

export function historicalBaseRate(category: string, question: string): number {
  const text = `${category} ${question}`.toLowerCase();
  if (text.includes('president') || text.includes('election')) return 0.42;
  if (text.includes('bitcoin') || text.includes('ethereum') || text.includes('crypto')) return 0.50;
  if (text.includes('sports') || text.includes('championship')) return 0.36;
  if (text.includes('inflation') || text.includes('fed')) return 0.45;
  return 0.50;
}

export function calibrate(rawProb: number, confidence: number): number {
  const boundedConfidence = Math.min(1, Math.max(0, confidence));
  const alpha = 2;
  const observedWeight = 8 * boundedConfidence;
  return clampProbability((rawProb * observedWeight + alpha * 0.5) / (observedWeight + alpha));
}

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.99, Math.max(0.01, value));
}

import type { OrderBook } from "../market/types.js";

export const midPrice = (book: OrderBook): number => {
  const bestBid = book.bids[0]?.price ?? 0;
  const bestAsk = book.asks[0]?.price ?? 1;
  return (bestBid + bestAsk) / 2;
};

export const marketImpliedProb = (book: OrderBook): number => {
  const mid = midPrice(book);
  return Math.min(0.999, Math.max(0.001, mid));
};

export const spreadAdjustedProb = (book: OrderBook): number => {
  const bestBid = book.bids[0]?.price ?? 0;
  const bestAsk = book.asks[0]?.price ?? 1;
  const spread = Math.max(0, bestAsk - bestBid);
  const raw = marketImpliedProb(book);
  return Math.min(0.999, Math.max(0.001, raw + spread / 2));
};

export const historicalBaseRate = (category: string, question: string): number => {
  const lowered = `${category} ${question}`.toLowerCase();
  if (lowered.includes("will") && lowered.includes("before")) {
    return 0.42;
  }
  if (lowered.includes("crypto")) {
    return 0.48;
  }
  if (lowered.includes("sports")) {
    return 0.5;
  }
  return 0.46;
};

export const calibrate = (rawProb: number, confidence: number): number => {
  const safeConfidence = Math.min(1, Math.max(0, confidence));
  const alpha = rawProb * 10 + 1;
  const beta = (1 - rawProb) * 10 + 1;
  const laplace = alpha / (alpha + beta);
  return laplace * safeConfidence + 0.5 * (1 - safeConfidence);
};

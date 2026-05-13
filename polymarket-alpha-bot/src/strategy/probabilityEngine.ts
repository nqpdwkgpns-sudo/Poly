import { OrderBook } from '../market/types.js';
import { FEES_BPS } from '../config/constants.js';

export function midPrice(book: OrderBook): number {
  const bid = book.bids[0]?.price;
  const ask = book.asks[0]?.price;
  if (bid !== undefined && ask !== undefined) return (bid + ask) / 2;
  if (bid !== undefined) return bid;
  if (ask !== undefined) return ask;
  return 0.5;
}

export function spread(book: OrderBook): number {
  const bid = book.bids[0]?.price;
  const ask = book.asks[0]?.price;
  if (bid === undefined || ask === undefined) return 1;
  return Math.max(0, ask - bid);
}

/** Market-implied probability (== mid in a YES/NO binary market). */
export function marketImpliedProb(book: OrderBook): number {
  return clampProb(midPrice(book));
}

/** Spread-adjusted break-even probability — a BUY at the ask must clear cost. */
export function spreadAdjustedProb(book: OrderBook, side: 'BUY' | 'SELL' = 'BUY'): number {
  const ask = book.asks[0]?.price ?? midPrice(book);
  const bid = book.bids[0]?.price ?? midPrice(book);
  const fee = FEES_BPS / 10_000;
  const px = side === 'BUY' ? ask : bid;
  return clampProb(px + (side === 'BUY' ? fee : -fee));
}

/**
 * Crude historical base rate by category. In production this should be backed
 * by resolved-market history from Gamma. We expose a default keyword-based
 * prior to keep the engine self-contained when no history is loaded.
 */
const CATEGORY_PRIORS: Record<string, number> = {
  politics: 0.5,
  crypto: 0.45,
  sports: 0.5,
  economics: 0.4,
  culture: 0.45,
  science: 0.4,
  other: 0.5,
};

const KEYWORD_PRIORS: Array<{ words: RegExp; prior: number }> = [
  { words: /\b(record|all-time high|ath|breaks)\b/i, prior: 0.35 },
  { words: /\b(recession|crash|fail|bankrupt|impeach)\b/i, prior: 0.25 },
  { words: /\b(re-?elect|incumbent)\b/i, prior: 0.55 },
];

export function historicalBaseRate(category: string, question: string): number {
  for (const kp of KEYWORD_PRIORS) {
    if (kp.words.test(question)) return kp.prior;
  }
  return CATEGORY_PRIORS[category] ?? 0.5;
}

/**
 * Laplace smoothing: blends a raw probability towards 0.5 inversely with
 * confidence. confidence=1 returns the raw value; confidence=0 returns 0.5.
 */
export function calibrate(rawProb: number, confidence: number): number {
  const c = clampUnit(confidence);
  return clampProb(c * rawProb + (1 - c) * 0.5);
}

export function clampProb(p: number, min = 0.01, max = 0.99): number {
  if (!Number.isFinite(p)) return 0.5;
  return Math.min(max, Math.max(min, p));
}

export function clampUnit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

export function topOfBookLiquidity(book: OrderBook, side: 'BUY' | 'SELL'): number {
  if (side === 'BUY') return book.asks[0]?.size ?? 0;
  return book.bids[0]?.size ?? 0;
}

import { describe, it, expect } from 'vitest';
import {
  midPrice,
  marketImpliedProb,
  spreadAdjustedProb,
  calibrate,
  historicalBaseRate,
  bestBidDepthUsdc,
  bestAskDepthUsdc,
} from '../src/strategy/probabilityEngine';
import type { OrderBook } from '../src/market/types';

function makeBook(bestBid: number, bestAsk: number, bids = 3, asks = 3): OrderBook {
  return {
    tokenId: 'test-token',
    bids: Array.from({ length: bids }, (_, i) => ({
      price: bestBid - i * 0.01,
      size: 1000,
    })),
    asks: Array.from({ length: asks }, (_, i) => ({
      price: bestAsk + i * 0.01,
      size: 1000,
    })),
    bestBid,
    bestAsk,
    midPrice: (bestBid + bestAsk) / 2,
    spread: bestAsk - bestBid,
    timestamp: Date.now(),
  };
}

describe('Probability Engine', () => {
  describe('midPrice', () => {
    it('returns average of best bid and ask', () => {
      const book = makeBook(0.45, 0.55);
      expect(midPrice(book)).toBeCloseTo(0.5, 5);
    });

    it('returns 0.5 when book is empty', () => {
      const book = makeBook(0, 1, 0, 0);
      expect(midPrice(book)).toBeCloseTo(0.5, 5);
    });

    it('handles tight spread', () => {
      const book = makeBook(0.499, 0.501);
      expect(midPrice(book)).toBeCloseTo(0.5, 3);
    });
  });

  describe('marketImpliedProb', () => {
    it('equals mid price for binary markets', () => {
      const book = makeBook(0.6, 0.7);
      expect(marketImpliedProb(book)).toBeCloseTo(midPrice(book), 5);
    });
  });

  describe('spreadAdjustedProb', () => {
    it('BUY break-even is the ask price', () => {
      const book = makeBook(0.45, 0.55);
      expect(spreadAdjustedProb(book, 'BUY')).toBeCloseTo(0.55, 5);
    });

    it('SELL break-even is 1 - bid price', () => {
      const book = makeBook(0.45, 0.55);
      expect(spreadAdjustedProb(book, 'SELL')).toBeCloseTo(0.55, 5);
    });

    it('BUY break-even > mid price (due to spread cost)', () => {
      const book = makeBook(0.45, 0.55);
      expect(spreadAdjustedProb(book, 'BUY')).toBeGreaterThan(midPrice(book));
    });
  });

  describe('calibrate', () => {
    it('returns raw prob at full confidence', () => {
      expect(calibrate(0.7, 1)).toBeCloseTo(0.7, 5);
    });

    it('returns 0.5 at zero confidence (Laplace smoothing)', () => {
      expect(calibrate(0.8, 0)).toBeCloseTo(0.5, 5);
    });

    it('pulls toward 0.5 at partial confidence', () => {
      const result = calibrate(0.8, 0.5);
      expect(result).toBeGreaterThan(0.5);
      expect(result).toBeLessThan(0.8);
    });

    it('output always between 0 and 1', () => {
      for (const p of [0, 0.1, 0.5, 0.9, 1]) {
        for (const c of [0, 0.25, 0.5, 0.75, 1]) {
          const result = calibrate(p, c);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('historicalBaseRate', () => {
    it('returns 0.5 for unknown category', () => {
      expect(historicalBaseRate('unknown', 'test question')).toBe(0.5);
    });

    it('returns value between 0 and 1 for all categories', () => {
      for (const cat of ['politics', 'crypto', 'sports', 'finance', 'entertainment', 'science']) {
        const rate = historicalBaseRate(cat, 'will X happen?');
        expect(rate).toBeGreaterThan(0);
        expect(rate).toBeLessThan(1);
      }
    });
  });

  describe('book depth', () => {
    it('calculates bid depth correctly', () => {
      const book = makeBook(0.5, 0.6, 3, 3);
      const depth = bestBidDepthUsdc(book);
      // 3 levels at prices 0.5, 0.49, 0.48 × 1000 each
      expect(depth).toBeCloseTo(0.5 * 1000 + 0.49 * 1000 + 0.48 * 1000, 1);
    });

    it('calculates ask depth correctly', () => {
      const book = makeBook(0.5, 0.6, 3, 3);
      const depth = bestAskDepthUsdc(book);
      expect(depth).toBeCloseTo(0.6 * 1000 + 0.61 * 1000 + 0.62 * 1000, 1);
    });
  });
});

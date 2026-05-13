import { describe, it, expect } from 'vitest';
import {
  midPrice,
  spread,
  marketImpliedProb,
  spreadAdjustedProb,
  calibrate,
  clampProb,
  historicalBaseRate,
} from '../src/strategy/probabilityEngine.js';
import { OrderBook } from '../src/market/types.js';

function book(b: [number, number][], a: [number, number][]): OrderBook {
  return {
    tokenId: 'x',
    bids: b.map(([price, size]) => ({ price, size })),
    asks: a.map(([price, size]) => ({ price, size })),
    timestamp: 0,
  };
}

describe('midPrice', () => {
  it('averages best bid/ask', () => {
    expect(midPrice(book([[0.5, 10]], [[0.6, 10]]))).toBeCloseTo(0.55);
  });

  it('falls back to one side when empty', () => {
    expect(midPrice(book([[0.4, 1]], []))).toBe(0.4);
    expect(midPrice(book([], [[0.7, 1]]))).toBe(0.7);
  });

  it('defaults to 0.5 on empty book', () => {
    expect(midPrice(book([], []))).toBe(0.5);
  });
});

describe('spread', () => {
  it('computes ask - bid', () => {
    expect(spread(book([[0.4, 1]], [[0.6, 1]]))).toBeCloseTo(0.2);
  });
  it('returns 1 when missing levels', () => {
    expect(spread(book([], []))).toBe(1);
  });
});

describe('marketImpliedProb / spreadAdjustedProb', () => {
  it('returns mid for impliedProb', () => {
    expect(marketImpliedProb(book([[0.4, 1]], [[0.6, 1]]))).toBeCloseTo(0.5);
  });
  it('spread adjusted buy uses ask', () => {
    const b = book([[0.4, 1]], [[0.62, 1]]);
    expect(spreadAdjustedProb(b, 'BUY')).toBeCloseTo(0.62);
  });
});

describe('calibrate', () => {
  it('confidence=1 returns raw', () => {
    expect(calibrate(0.8, 1)).toBeCloseTo(0.8);
  });
  it('confidence=0 returns 0.5', () => {
    expect(calibrate(0.9, 0)).toBeCloseTo(0.5);
  });
  it('clamps to [0.01,0.99]', () => {
    expect(calibrate(1.5, 1)).toBeLessThanOrEqual(0.99);
    expect(calibrate(-1, 1)).toBeGreaterThanOrEqual(0.01);
  });
});

describe('clampProb', () => {
  it('clamps default range', () => {
    expect(clampProb(2)).toBe(0.99);
    expect(clampProb(-1)).toBe(0.01);
  });
});

describe('historicalBaseRate', () => {
  it('returns category default when no keyword match', () => {
    expect(historicalBaseRate('politics', 'something neutral')).toBe(0.5);
  });
  it('matches keyword priors', () => {
    expect(historicalBaseRate('politics', 'will the incumbent re-elect?')).toBeCloseTo(0.55);
    expect(historicalBaseRate('crypto', 'will BTC hit all-time high?')).toBeCloseTo(0.35);
  });
});

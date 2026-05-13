import { describe, expect, it } from 'vitest';
import type { OrderBook } from '../src/market/types.js';
import { calibrate, midPrice, spreadAdjustedProb } from '../src/strategy/probabilityEngine.js';

describe('probabilityEngine', () => {
  const book: OrderBook = { tokenId: '1', bids: [{ price: 0.42, size: 100 }], asks: [{ price: 0.46, size: 100 }], timestamp: Date.now() };

  it('calculates mid price from top of book', () => {
    expect(midPrice(book)).toBeCloseTo(0.44);
  });

  it('calculates spread-adjusted break-even probability', () => {
    expect(spreadAdjustedProb(book)).toBeCloseTo(0.46);
  });

  it('calibrates raw probabilities toward 50% under low confidence', () => {
    expect(calibrate(0.9, 0.1)).toBeLessThan(0.9);
  });
});

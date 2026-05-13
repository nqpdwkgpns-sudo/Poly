import { describe, expect, it } from 'vitest';
import { fractionalKelly, kellyFraction, sizePosition } from '../src/strategy/kellyEngine.js';
import type { Signal } from '../src/strategy/types.js';

describe('kellyEngine', () => {
  it('returns positive Kelly for positive edge and odds', () => {
    expect(kellyFraction(0.08, 1)).toBeGreaterThan(0);
  });

  it('bounds fractional Kelly output', () => {
    expect(fractionalKelly(0.5, 2, 0.25)).toBeGreaterThanOrEqual(0);
    expect(fractionalKelly(0.5, 2, 0.25)).toBeLessThanOrEqual(1);
  });

  it('returns zero size for zero or negative edge', () => {
    const signal = baseSignal({ edge: 0 });
    expect(sizePosition(signal, 1_000)).toBe(0);
    expect(sizePosition(baseSignal({ edge: -0.01 }), 1_000)).toBe(0);
  });

  it('caps position by signal sizing, max position, and balance', () => {
    const sized = sizePosition(baseSignal({ edge: 0.2, sizing: 10_000 }), 100);
    expect(sized).toBeLessThanOrEqual(100);
  });
});

function baseSignal(overrides: Partial<Signal>): Signal {
  return {
    conditionId: '0x1',
    tokenId: '1',
    marketQuestion: 'Will test pass?',
    category: 'tests',
    strategy: 'unit',
    side: 'BUY',
    impliedProbability: 0.6,
    marketProbability: 0.5,
    edge: 0.1,
    confidence: 0.8,
    sizing: 100,
    ...overrides
  };
}

import { describe, it, expect } from 'vitest';
import {
  kellyFraction,
  fractionalKelly,
  priceToOdds,
  sizePosition,
  expectedValue,
} from '../src/strategy/kellyEngine.js';
import { Signal } from '../src/strategy/types.js';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    conditionId: '0xabc',
    tokenId: '1',
    side: 'BUY',
    impliedProbability: 0.6,
    marketProbability: 0.5,
    edge: 0.1,
    confidence: 1,
    sizing: 0,
    strategy: 'test',
    price: 0.5,
    ts: 0,
    ...overrides,
  };
}

describe('kellyFraction', () => {
  it('returns 0 for non-positive edge', () => {
    expect(kellyFraction(0, 1)).toBe(0);
    expect(kellyFraction(-0.05, 2)).toBe(0);
  });

  it('grows with edge', () => {
    expect(kellyFraction(0.05, 1)).toBeLessThan(kellyFraction(0.15, 1));
  });

  it('is bounded in [0,1]', () => {
    expect(kellyFraction(0.49, 0.01)).toBeLessThanOrEqual(1);
    expect(kellyFraction(0.49, 0.01)).toBeGreaterThanOrEqual(0);
  });

  it('handles invalid odds gracefully', () => {
    expect(kellyFraction(0.1, 0)).toBe(0);
    expect(kellyFraction(0.1, -1)).toBe(0);
  });
});

describe('fractionalKelly', () => {
  it('respects fraction multiplier', () => {
    const full = kellyFraction(0.1, 1);
    expect(fractionalKelly(0.1, 1, 0.5)).toBeCloseTo(full * 0.5, 5);
    expect(fractionalKelly(0.1, 1, 0)).toBe(0);
  });

  it('clamps fraction to [0,1]', () => {
    expect(fractionalKelly(0.1, 1, 2)).toBeCloseTo(kellyFraction(0.1, 1), 5);
    expect(fractionalKelly(0.1, 1, -1)).toBe(0);
  });
});

describe('priceToOdds', () => {
  it('inverts probability correctly', () => {
    expect(priceToOdds(0.5)).toBeCloseTo(1);
    expect(priceToOdds(0.25)).toBeCloseTo(3);
  });

  it('returns 1 for invalid prices', () => {
    expect(priceToOdds(0)).toBe(1);
    expect(priceToOdds(1)).toBe(1);
    expect(priceToOdds(NaN)).toBe(1);
  });
});

describe('sizePosition', () => {
  it('returns 0 for zero/negative edge', () => {
    const s = makeSignal({ edge: 0 });
    expect(sizePosition(s, 1000).size).toBe(0);
  });

  it('caps at MAX_POSITION_USDC', () => {
    const s = makeSignal({ edge: 0.4, confidence: 1, price: 0.5 });
    const r = sizePosition(s, 1_000_000);
    expect(r.size).toBeLessThanOrEqual(500); // default MAX_POSITION_USDC
  });

  it('caps at balance', () => {
    const s = makeSignal({ edge: 0.4, confidence: 1, price: 0.5 });
    const r = sizePosition(s, 100);
    expect(r.size).toBeLessThanOrEqual(100);
  });
});

describe('expectedValue', () => {
  it('positive when implied > price', () => {
    const s = makeSignal({ impliedProbability: 0.6, price: 0.5 });
    expect(expectedValue(s)).toBeGreaterThan(0);
  });

  it('negative when implied < price', () => {
    const s = makeSignal({ impliedProbability: 0.4, price: 0.5 });
    expect(expectedValue(s)).toBeLessThan(0);
  });
});

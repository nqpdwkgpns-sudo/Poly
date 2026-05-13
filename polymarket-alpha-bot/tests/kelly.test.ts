import { describe, it, expect } from 'vitest';
import { kellyFraction, fractionalKelly, sizePosition } from '../src/strategy/kellyEngine';
import type { Signal } from '../src/strategy/types';

describe('Kelly Engine', () => {
  describe('kellyFraction', () => {
    it('returns 0 for zero edge', () => {
      expect(kellyFraction(0, 1)).toBe(0);
    });

    it('returns 0 for negative edge', () => {
      expect(kellyFraction(-0.05, 1)).toBe(0);
    });

    it('returns 0 for zero odds', () => {
      expect(kellyFraction(0.1, 0)).toBe(0);
    });

    it('computes correct Kelly for edge=0.1, odds=1', () => {
      expect(kellyFraction(0.1, 1)).toBeCloseTo(0.1, 5);
    });

    it('computes correct Kelly for edge=0.3, odds=2', () => {
      expect(kellyFraction(0.3, 2)).toBeCloseTo(0.15, 5);
    });

    it('always returns non-negative value', () => {
      const result = kellyFraction(0.05, 0.5);
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('fractionalKelly', () => {
    it('applies fraction multiplier', () => {
      const full = kellyFraction(0.1, 1);
      const quarter = fractionalKelly(0.1, 1, 0.25);
      expect(quarter).toBeCloseTo(full * 0.25, 5);
    });

    it('returns 0 when edge is negative', () => {
      expect(fractionalKelly(-0.1, 1, 0.25)).toBe(0);
    });

    it('fractional output is always <= full kelly', () => {
      for (const fraction of [0.1, 0.25, 0.5, 1.0]) {
        const full = kellyFraction(0.2, 1.5);
        const frac = fractionalKelly(0.2, 1.5, fraction);
        expect(frac).toBeLessThanOrEqual(full + 0.0001);
      }
    });
  });

  describe('sizePosition', () => {
    const makeSignal = (edge: number, confidence: number, marketProb: number): Signal => ({
      conditionId: 'test',
      tokenId: 'token',
      side: 'BUY',
      impliedProbability: marketProb + edge,
      marketProbability: marketProb,
      edge,
      confidence,
      sizing: 100,
      strategyName: 'test',
      reasoning: '',
    });

    it('returns 0 for zero edge', () => {
      expect(sizePosition(makeSignal(0, 0.8, 0.5), 1000)).toBe(0);
    });

    it('returns 0 for negative edge', () => {
      expect(sizePosition(makeSignal(-0.05, 0.8, 0.5), 1000)).toBe(0);
    });

    it('does not exceed MAX_POSITION_USDC', () => {
      const size = sizePosition(makeSignal(0.2, 0.9, 0.5), 100000);
      expect(size).toBeLessThanOrEqual(500); // MAX_POSITION_USDC default
    });

    it('does not exceed 10% of available balance', () => {
      const balance = 1000;
      const size = sizePosition(makeSignal(0.15, 0.8, 0.5), balance);
      expect(size).toBeLessThanOrEqual(balance * 0.1 + 0.01);
    });

    it('scales with confidence', () => {
      const balance = 10000;
      const lowConf = sizePosition(makeSignal(0.1, 0.2, 0.5), balance);
      const highConf = sizePosition(makeSignal(0.1, 0.9, 0.5), balance);
      expect(highConf).toBeGreaterThan(lowConf);
    });
  });
});

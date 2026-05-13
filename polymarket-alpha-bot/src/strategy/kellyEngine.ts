import { Signal } from './types';
import { config } from '../config/env';

export function kellyFraction(edge: number, odds: number): number {
  if (edge <= 0 || odds <= 0) return 0;
  // Full Kelly: f* = (p*b - q) / b where b = odds, p = win prob, q = lose prob
  // Simplified for binary market: f* = edge / odds
  return Math.max(0, edge / odds);
}

export function fractionalKelly(edge: number, odds: number, fraction: number): number {
  return kellyFraction(edge, odds) * fraction;
}

export function expectedValue(signal: Signal): number {
  const { impliedProbability, edge } = signal;
  // EV = p * (1/marketProb - 1) - (1-p)
  const odds = 1 / signal.marketProbability - 1;
  return impliedProbability * odds - (1 - impliedProbability);
}

export function sizePosition(signal: Signal, availableBalance: number): number {
  if (signal.edge <= 0) return 0;

  const odds = (1 - signal.marketProbability) / signal.marketProbability;
  const fraction = fractionalKelly(signal.edge, odds, config.KELLY_FRACTION);

  let size = availableBalance * fraction;

  // Apply confidence multiplier
  size *= signal.confidence;

  // Cap at max position size
  size = Math.min(size, config.MAX_POSITION_USDC);

  // Cap at available balance
  size = Math.min(size, availableBalance * 0.1); // never risk more than 10% per trade

  // Minimum trade size
  if (size < 1) return 0;

  return Math.round(size * 100) / 100;
}

export interface SizingResult {
  size: number;
  kellyCriterion: number;
  fractionalKelly: number;
  expectedValue: number;
  riskRewardRatio: number;
}

export function computeFullSizing(signal: Signal, availableBalance: number): SizingResult {
  const odds = (1 - signal.marketProbability) / signal.marketProbability;
  const fullKelly = kellyFraction(signal.edge, odds);
  const fracKelly = fullKelly * config.KELLY_FRACTION;
  const ev = expectedValue(signal);
  const size = sizePosition(signal, availableBalance);

  return {
    size,
    kellyCriterion: fullKelly,
    fractionalKelly: fracKelly,
    expectedValue: ev,
    riskRewardRatio: ev > 0 ? signal.impliedProbability / (1 - signal.impliedProbability) : 0,
  };
}

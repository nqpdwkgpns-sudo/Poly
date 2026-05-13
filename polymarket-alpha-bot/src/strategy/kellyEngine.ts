import { Signal } from './types.js';
import { config } from '../config/env.js';
import { clampUnit } from './probabilityEngine.js';

/**
 * Full Kelly fraction for a binary bet with edge.
 *
 * Given true win probability `p`, decimal odds `b` (payoff per unit staked),
 * the Kelly fraction is f* = (p*(b+1) - 1) / b.
 *
 * Here we accept `edge` (= p - market_p) and `odds` (b) directly to keep the
 * call sites strategy-agnostic.
 */
export function kellyFraction(edge: number, odds: number): number {
  if (!Number.isFinite(edge) || !Number.isFinite(odds) || odds <= 0) return 0;
  if (edge <= 0) return 0;
  const p = Math.min(0.999, Math.max(0.001, 0.5 + edge));
  const f = (p * (odds + 1) - 1) / odds;
  return Math.max(0, Math.min(1, f));
}

export function fractionalKelly(edge: number, odds: number, fraction: number): number {
  return clampUnit(fraction) * kellyFraction(edge, odds);
}

/**
 * Convert a Polymarket price (0..1 probability) to "decimal odds" for the
 * Kelly formula: a $1 stake to buy at price `p` returns $1/p if it resolves.
 */
export function priceToOdds(price: number): number {
  if (!Number.isFinite(price) || price <= 0 || price >= 1) return 1;
  return (1 - price) / price;
}

export interface SizingResult {
  size: number;
  kellyFraction: number;
  cappedBy: 'kelly' | 'max_position' | 'balance' | 'edge';
}

export function sizePosition(signal: Signal, balance: number): SizingResult {
  const maxPos = config.MAX_POSITION_USDC ?? 500;
  const fraction = config.KELLY_FRACTION ?? 0.25;
  if (signal.edge <= 0) return { size: 0, kellyFraction: 0, cappedBy: 'edge' };

  const odds = priceToOdds(signal.price);
  const kf = fractionalKelly(signal.edge, odds, fraction);
  let size = kf * balance * signal.confidence;
  let cappedBy: SizingResult['cappedBy'] = 'kelly';

  if (size > maxPos) {
    size = maxPos;
    cappedBy = 'max_position';
  }
  if (size > balance) {
    size = balance;
    cappedBy = 'balance';
  }
  return { size: roundUsdc(size), kellyFraction: kf, cappedBy };
}

export function expectedValue(signal: Signal): number {
  const p = clampUnit(signal.impliedProbability);
  const odds = priceToOdds(signal.price);
  return p * odds - (1 - p);
}

function roundUsdc(x: number): number {
  return Math.round(x * 100) / 100;
}

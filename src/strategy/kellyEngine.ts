import { config } from '../config/env.js';
import type { Signal } from './types.js';

export function kellyFraction(edge: number, odds: number): number {
  if (edge <= 0 || odds <= 0) return 0;
  const winProbability = Math.min(0.99, Math.max(0.01, edge + 1 / (odds + 1)));
  const lossProbability = 1 - winProbability;
  return Math.max(0, (odds * winProbability - lossProbability) / odds);
}

export function fractionalKelly(edge: number, odds: number, fraction = config.KELLY_FRACTION): number {
  return Math.max(0, Math.min(1, kellyFraction(edge, odds) * fraction));
}

export function sizePosition(signal: Signal, balance: number): number {
  if (signal.edge <= 0 || balance <= 0) return 0;
  const price = Math.max(0.01, Math.min(0.99, signal.marketProbability));
  const odds = (1 - price) / price;
  const kellySize = balance * fractionalKelly(signal.edge, odds);
  return roundUsdc(Math.min(config.MAX_POSITION_USDC, signal.sizing, balance, kellySize));
}

export function expectedValue(signal: Signal): number {
  const win = signal.impliedProbability * (1 - signal.marketProbability);
  const loss = (1 - signal.impliedProbability) * signal.marketProbability;
  return (win - loss) * signal.sizing;
}

function roundUsdc(value: number): number {
  return Math.floor(value * 100) / 100;
}

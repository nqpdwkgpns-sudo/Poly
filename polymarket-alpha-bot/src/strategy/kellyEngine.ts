import { config } from "../config/env.js";
import type { Signal } from "./types.js";

export const kellyFraction = (edge: number, odds: number): number => {
  if (edge <= 0 || odds <= 0) {
    return 0;
  }
  const b = odds;
  const p = Math.min(0.999, Math.max(0.001, 0.5 + edge));
  const q = 1 - p;
  const raw = (b * p - q) / b;
  return Math.max(0, raw);
};

export const fractionalKelly = (edge: number, odds: number, fraction = config.KELLY_FRACTION): number =>
  Math.max(0, kellyFraction(edge, odds) * Math.min(1, Math.max(0, fraction)));

export const expectedValue = (signal: Signal): number => {
  const p = signal.impliedProbability;
  const win = 1 - signal.marketProbability;
  const lose = signal.marketProbability;
  return p * win - (1 - p) * lose;
};

export const sizePosition = (signal: Signal, balance: number): number => {
  if (signal.edge <= 0) {
    return 0;
  }
  const odds = (1 - signal.marketProbability) / Math.max(signal.marketProbability, 0.001);
  const k = fractionalKelly(signal.edge, odds);
  const proposed = balance * k;
  return Math.max(0, Math.min(config.MAX_POSITION_USDC, balance, proposed));
};

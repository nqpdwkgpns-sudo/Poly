import { config } from '../config/env.js';
import { BotState } from './state.js';

export interface DrawdownInfo {
  peak: number;
  current: number;
  drawdownPct: number;
  exceeded: boolean;
}

export function updateDrawdown(state: BotState, currentBalance: number): DrawdownInfo {
  if (currentBalance > state.peakBalanceUsdc) state.peakBalanceUsdc = currentBalance;
  state.balanceUsdc = currentBalance;
  return getDrawdown(state);
}

export function getDrawdown(state: BotState): DrawdownInfo {
  const peak = Math.max(state.peakBalanceUsdc, state.balanceUsdc);
  const dd = peak <= 0 ? 0 : Math.max(0, (peak - state.balanceUsdc) / peak);
  const limit = config.MAX_DRAWDOWN_PCT ?? 0.2;
  return {
    peak,
    current: state.balanceUsdc,
    drawdownPct: dd,
    exceeded: dd > limit,
  };
}

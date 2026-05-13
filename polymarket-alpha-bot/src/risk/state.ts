import fs from 'fs';
import path from 'path';
import { STATE_FILE } from '../config/constants';
import { logger } from '../monitoring/logger';

export type CircuitBreakerStatus = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BotState {
  balanceUsdc: number;
  peakBalance: number;
  openPositionCount: number;
  dailyRealizedPnl: number;
  dailyStartBalance: number;
  totalRealizedPnl: number;
  circuitBreakerStatus: CircuitBreakerStatus;
  circuitBreakerOpenedAt: number | null;
  circuitBreakerReason: string | null;
  consecutiveFailedOrders: number;
  drawdownPct: number;
  lastResetDate: string; // YYYY-MM-DD UTC
  startedAt: string;
  categoryExposure: Record<string, number>;
  rpcErrorCount: number;
  rpcErrorWindowStart: number;
}

function defaultState(): BotState {
  const now = new Date();
  return {
    balanceUsdc: 0,
    peakBalance: 0,
    openPositionCount: 0,
    dailyRealizedPnl: 0,
    dailyStartBalance: 0,
    totalRealizedPnl: 0,
    circuitBreakerStatus: 'CLOSED',
    circuitBreakerOpenedAt: null,
    circuitBreakerReason: null,
    consecutiveFailedOrders: 0,
    drawdownPct: 0,
    lastResetDate: now.toISOString().slice(0, 10),
    startedAt: now.toISOString(),
    categoryExposure: {},
    rpcErrorCount: 0,
    rpcErrorWindowStart: Date.now(),
  };
}

export function loadState(): BotState {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const saved = JSON.parse(raw) as Partial<BotState>;
      return { ...defaultState(), ...saved };
    }
  } catch (err) {
    logger.error({ err }, 'Failed to load state from disk');
  }
  return defaultState();
}

export function saveState(state: BotState): void {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    logger.error({ err }, 'Failed to save state to disk');
  }
}

export function resetDailyStats(state: BotState): BotState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...state,
    dailyRealizedPnl: 0,
    dailyStartBalance: state.balanceUsdc,
    lastResetDate: today,
    consecutiveFailedOrders: 0,
    rpcErrorCount: 0,
    rpcErrorWindowStart: Date.now(),
  };
}

export function shouldResetDaily(state: BotState): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return state.lastResetDate !== today;
}

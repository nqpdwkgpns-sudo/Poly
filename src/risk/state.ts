import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '../config/env.js';
import type { OrderSide } from '../market/types.js';

export interface Position {
  conditionId: string;
  tokenId: string;
  marketQuestion: string;
  category: string;
  side: OrderSide;
  entryPrice: number;
  currentPrice: number;
  size: number;
  openedAt: string;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface PnlPoint {
  date: string;
  pnl: number;
}

export interface BotState {
  balanceUsdc: number;
  peakBalanceUsdc: number;
  dailyRealizedPnl: number;
  dailyLossResetAt: string;
  openPositions: Position[];
  openOrders: string[];
  circuitBreakerStatus: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failedOrders: number;
  rpcErrors: number[];
  lastSignals: Array<Record<string, unknown>>;
  pnlHistory: PnlPoint[];
  startedAt: string;
}

export function defaultState(): BotState {
  const now = new Date();
  return {
    balanceUsdc: 0,
    peakBalanceUsdc: 0,
    dailyRealizedPnl: 0,
    dailyLossResetAt: nextMidnightUtc(now).toISOString(),
    openPositions: [],
    openOrders: [],
    circuitBreakerStatus: 'CLOSED',
    failedOrders: 0,
    rpcErrors: [],
    lastSignals: [],
    pnlHistory: [],
    startedAt: now.toISOString()
  };
}

export async function loadState(filePath = join(config.DATA_DIR, 'state.json')): Promise<BotState> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return { ...defaultState(), ...JSON.parse(raw) as Partial<BotState> };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultState();
    throw error;
  }
}

export async function saveState(state: BotState, filePath = join(config.DATA_DIR, 'state.json')): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(state, null, 2));
}

export function resetDailyStats(state: BotState, now = new Date()): BotState {
  if (now < new Date(state.dailyLossResetAt)) return state;
  return { ...state, dailyRealizedPnl: 0, dailyLossResetAt: nextMidnightUtc(now).toISOString() };
}

function nextMidnightUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

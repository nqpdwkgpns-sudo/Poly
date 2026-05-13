import { promises as fs } from 'node:fs';
import path from 'node:path';
import { child } from '../monitoring/logger.js';
import { DATA_DIR, STATE_FILE } from '../config/constants.js';
import { Position, MarketCategory } from '../market/types.js';

const log = child('state');

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BotState {
  balanceUsdc: number;
  peakBalanceUsdc: number;
  positions: Position[];
  realizedPnlToday: number;
  realizedPnlTotal: number;
  dailyResetTs: number;
  circuitBreaker: CircuitBreakerState;
  circuitBreakerReason?: string;
  circuitBreakerOpenedAt?: number;
  rpcErrors: { count: number; windowStart: number };
  consecutiveOrderFailures: number;
  startedAt: number;
  updatedAt: number;
  /** rolling per-category notional exposure */
  categoryExposure: Record<MarketCategory, number>;
}

export function emptyState(): BotState {
  return {
    balanceUsdc: 0,
    peakBalanceUsdc: 0,
    positions: [],
    realizedPnlToday: 0,
    realizedPnlTotal: 0,
    dailyResetTs: nextMidnightUtc(Date.now()),
    circuitBreaker: 'CLOSED',
    rpcErrors: { count: 0, windowStart: Date.now() },
    consecutiveOrderFailures: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    categoryExposure: {
      politics: 0,
      crypto: 0,
      sports: 0,
      economics: 0,
      culture: 0,
      science: 0,
      other: 0,
    },
  };
}

export function nextMidnightUtc(now: number): number {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

const FILE = path.join(DATA_DIR, STATE_FILE);

export async function loadState(): Promise<BotState> {
  try {
    const buf = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(buf) as BotState;
    // Forward-compat: backfill any new fields
    return { ...emptyState(), ...parsed, updatedAt: Date.now() };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn({ err: (err as Error).message }, 'failed to load state');
    }
    return emptyState();
  }
}

export async function saveState(state: BotState): Promise<void> {
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    state.updatedAt = Date.now();
    await fs.writeFile(FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'failed to save state');
  }
}

export function resetDailyStats(state: BotState): BotState {
  state.realizedPnlToday = 0;
  state.dailyResetTs = nextMidnightUtc(Date.now());
  log.info('daily stats reset (midnight UTC)');
  return state;
}

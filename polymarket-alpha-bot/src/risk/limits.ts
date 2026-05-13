import { config } from '../config/env.js';
import { RISK_LIMITS } from '../config/constants.js';
import { Market, OrderBook } from '../market/types.js';
import { Signal } from '../strategy/types.js';
import { BotState } from './state.js';

export interface CheckResult {
  ok: boolean;
  reason?: string;
}

const PASS: CheckResult = { ok: true };

export function checkDailyLossLimit(state: BotState): CheckResult {
  const limit = config.DAILY_LOSS_LIMIT_USDC ?? 200;
  if (state.realizedPnlToday <= -limit) {
    return { ok: false, reason: `daily_loss_limit (${state.realizedPnlToday.toFixed(2)})` };
  }
  return PASS;
}

export function checkMaxOpenPositions(state: BotState): CheckResult {
  const limit = config.MAX_OPEN_POSITIONS ?? 10;
  if (state.positions.length >= limit) return { ok: false, reason: 'max_open_positions' };
  return PASS;
}

export function checkMaxPositionSize(signal: Signal, sized?: number): CheckResult {
  const limit = config.MAX_POSITION_USDC ?? 500;
  const size = sized ?? signal.sizing;
  if (size > limit) return { ok: false, reason: `max_position_size ${size.toFixed(0)}>${limit}` };
  return PASS;
}

export function checkConcentration(signal: Signal, state: BotState, market?: Market): CheckResult {
  const total = state.balanceUsdc + sumExposure(state);
  if (total <= 0) return PASS;
  const cat = market?.category;
  if (!cat) return PASS;
  const projected = (state.categoryExposure[cat] ?? 0) + signal.sizing;
  const pct = projected / Math.max(total, 1);
  if (pct > RISK_LIMITS.CATEGORY_CONCENTRATION_PCT) {
    return { ok: false, reason: `concentration ${cat} ${(pct * 100).toFixed(0)}%` };
  }
  return PASS;
}

export function checkMinLiquidity(book: OrderBook, side: 'BUY' | 'SELL'): CheckResult {
  const top = side === 'BUY' ? book.asks[0] : book.bids[0];
  const depth = top?.size ?? 0;
  if (depth < RISK_LIMITS.TOP_OF_BOOK_MIN_USDC) {
    return { ok: false, reason: `min_liquidity ${depth.toFixed(0)}` };
  }
  return PASS;
}

export function checkMarketExpiry(market: Market): CheckResult {
  const ms = Date.parse(market.endDate) - Date.now();
  const hours = ms / 3_600_000;
  if (hours < RISK_LIMITS.MIN_MARKET_HOURS_TO_EXPIRY) {
    return { ok: false, reason: `expiry ${hours.toFixed(1)}h` };
  }
  return PASS;
}

export function checkDuplicatePosition(conditionId: string, state: BotState): CheckResult {
  if (state.positions.some((p) => p.conditionId === conditionId)) {
    return { ok: false, reason: 'duplicate_position' };
  }
  return PASS;
}

export function sumExposure(state: BotState): number {
  return state.positions.reduce((acc, p) => acc + p.size, 0);
}

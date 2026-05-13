import { config } from '../config/env.js';
import type { Market, OrderBook } from '../market/types.js';
import type { Signal } from '../strategy/types.js';
import type { BotState } from './state.js';

export interface LimitResult {
  ok: boolean;
  reason?: string;
}

export function pass(): LimitResult {
  return { ok: true };
}

export function fail(reason: string): LimitResult {
  return { ok: false, reason };
}

export function checkDailyLossLimit(state: BotState): LimitResult {
  return state.dailyRealizedPnl <= -config.DAILY_LOSS_LIMIT_USDC
    ? fail(`daily loss limit breached: ${state.dailyRealizedPnl.toFixed(2)} USDC`)
    : pass();
}

export function checkMaxOpenPositions(state: BotState): LimitResult {
  return state.openPositions.length >= config.MAX_OPEN_POSITIONS
    ? fail(`max open positions reached: ${state.openPositions.length}`)
    : pass();
}

export function checkMaxPositionSize(signal: Signal): LimitResult {
  return signal.sizing > config.MAX_POSITION_USDC
    ? fail(`position size ${signal.sizing.toFixed(2)} exceeds ${config.MAX_POSITION_USDC}`)
    : pass();
}

export function checkConcentration(signal: Signal, state: BotState): LimitResult {
  const exposureByCategory = new Map<string, number>();
  let totalExposure = 0;
  for (const position of state.openPositions) {
    const exposure = position.entryPrice * position.size;
    totalExposure += exposure;
    exposureByCategory.set(position.category, (exposureByCategory.get(position.category) ?? 0) + exposure);
  }
  const added = signal.sizing;
  totalExposure += added;
  const categoryExposure = (exposureByCategory.get(signal.category) ?? 0) + added;
  if (totalExposure <= 0) return pass();
  const concentration = categoryExposure / totalExposure;
  return concentration > 0.4 ? fail(`category concentration ${(concentration * 100).toFixed(1)}% exceeds 40%`) : pass();
}

export function checkMinLiquidity(book: OrderBook, signal: Signal): LimitResult {
  const level = signal.side === 'BUY' ? book.asks[0] : book.bids[0];
  const depth = level ? level.price * level.size : 0;
  return depth < 500 ? fail(`top-of-book depth ${depth.toFixed(2)} USDC below 500`) : pass();
}

export function checkMarketExpiry(market: Market): LimitResult {
  const hoursUntilExpiry = (new Date(market.endDate).getTime() - Date.now()) / 3_600_000;
  return hoursUntilExpiry < 12 ? fail(`market expires in ${hoursUntilExpiry.toFixed(2)}h`) : pass();
}

export function checkDuplicatePosition(conditionId: string, state: BotState): LimitResult {
  return state.openPositions.some((position) => position.conditionId === conditionId)
    ? fail(`duplicate position for ${conditionId}`)
    : pass();
}

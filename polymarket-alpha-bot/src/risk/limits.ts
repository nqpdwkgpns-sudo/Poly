import { BotState } from './state';
import { Signal } from '../strategy/types';
import { OrderBook } from '../market/types';
import { Market } from '../market/types';
import { config } from '../config/env';
import { MIN_BOOK_DEPTH_USDC, MIN_MARKET_EXPIRY_HOURS } from '../config/constants';

export interface LimitCheckResult {
  passed: boolean;
  reason?: string;
}

export function checkDailyLossLimit(state: BotState): LimitCheckResult {
  if (state.dailyRealizedPnl <= -config.DAILY_LOSS_LIMIT_USDC) {
    return {
      passed: false,
      reason: `Daily loss limit breached: ${state.dailyRealizedPnl.toFixed(2)} USDC (limit: -${config.DAILY_LOSS_LIMIT_USDC})`,
    };
  }
  return { passed: true };
}

export function checkMaxOpenPositions(state: BotState): LimitCheckResult {
  if (state.openPositionCount >= config.MAX_OPEN_POSITIONS) {
    return {
      passed: false,
      reason: `Max open positions reached: ${state.openPositionCount}/${config.MAX_OPEN_POSITIONS}`,
    };
  }
  return { passed: true };
}

export function checkMaxPositionSize(signal: Signal): LimitCheckResult {
  if (signal.sizing > config.MAX_POSITION_USDC) {
    return {
      passed: false,
      reason: `Position size ${signal.sizing.toFixed(2)} exceeds max ${config.MAX_POSITION_USDC}`,
    };
  }
  return { passed: true };
}

export function checkConcentration(signal: Signal, state: BotState, marketCategory: string): LimitCheckResult {
  const totalExposure = Object.values(state.categoryExposure).reduce((a, b) => a + b, 0);
  if (totalExposure === 0) return { passed: true };

  const categoryExposure = (state.categoryExposure[marketCategory] ?? 0) + signal.sizing;
  const concentrationPct = categoryExposure / (totalExposure + signal.sizing);

  if (concentrationPct > 0.40) {
    return {
      passed: false,
      reason: `Category "${marketCategory}" would exceed 40% concentration: ${(concentrationPct * 100).toFixed(1)}%`,
    };
  }
  return { passed: true };
}

export function checkMinLiquidity(book: OrderBook, side: 'BUY' | 'SELL'): LimitCheckResult {
  const depth = side === 'BUY'
    ? book.asks.slice(0, 5).reduce((s, a) => s + a.price * a.size, 0)
    : book.bids.slice(0, 5).reduce((s, b) => s + b.price * b.size, 0);

  if (depth < MIN_BOOK_DEPTH_USDC) {
    return {
      passed: false,
      reason: `Insufficient liquidity: $${depth.toFixed(0)} depth on ${side} side (min $${MIN_BOOK_DEPTH_USDC})`,
    };
  }
  return { passed: true };
}

export function checkMarketExpiry(market: Market): LimitCheckResult {
  const hoursToExpiry = (new Date(market.endDate).getTime() - Date.now()) / 3600000;
  if (hoursToExpiry < MIN_MARKET_EXPIRY_HOURS) {
    return {
      passed: false,
      reason: `Market expires in ${hoursToExpiry.toFixed(1)}h (min ${MIN_MARKET_EXPIRY_HOURS}h)`,
    };
  }
  return { passed: true };
}

export function checkDuplicatePosition(conditionId: string, state: BotState, openConditionIds: Set<string>): LimitCheckResult {
  if (openConditionIds.has(conditionId)) {
    return {
      passed: false,
      reason: `Already have open position in ${conditionId}`,
    };
  }
  return { passed: true };
}

export function getDailyLossUtilization(state: BotState): number {
  return Math.abs(Math.min(0, state.dailyRealizedPnl)) / config.DAILY_LOSS_LIMIT_USDC;
}

export function getPositionUtilization(state: BotState): number {
  return state.openPositionCount / config.MAX_OPEN_POSITIONS;
}

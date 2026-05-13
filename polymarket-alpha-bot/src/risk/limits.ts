import { DEFAULT_LIMITS, ONE_HOUR_MS } from "../config/constants.js";
import { config } from "../config/env.js";
import type { Market, OrderBook } from "../market/types.js";
import type { Signal } from "../strategy/types.js";
import type { BotState } from "./state.js";

export const checkDailyLossLimit = (state: BotState): string | null => {
  if (state.dailyRealizedPnl < -config.DAILY_LOSS_LIMIT_USDC) {
    return "daily_loss_limit_breached";
  }
  return null;
};

export const checkMaxOpenPositions = (state: BotState): string | null => {
  if (state.openPositions.length >= config.MAX_OPEN_POSITIONS) {
    return "max_open_positions_reached";
  }
  return null;
};

export const checkMaxPositionSize = (signal: Signal): string | null => {
  if (signal.sizing > config.MAX_POSITION_USDC) {
    return "max_position_size_exceeded";
  }
  return null;
};

export const checkConcentration = (signal: Signal, state: BotState, category: string): string | null => {
  const totalExposure = state.openPositions.reduce((acc, position) => acc + position.entryPrice * position.size, 0);
  if (totalExposure === 0) {
    return null;
  }
  const categoryExposure = state.openPositions
    .filter((position) => position.category.toLowerCase() === category.toLowerCase())
    .reduce((acc, position) => acc + position.entryPrice * position.size, 0);
  const nextExposure = totalExposure + signal.sizing;
  if (nextExposure <= 0) {
    return null;
  }
  const nextCategoryShare = (categoryExposure + signal.sizing) / nextExposure;
  if (nextCategoryShare > DEFAULT_LIMITS.categoryMaxConcentration) {
    return "category_concentration_limit";
  }
  return null;
};

export const checkMinLiquidity = (book: OrderBook, side: Signal["side"]): string | null => {
  const level = side === "BUY" ? book.asks[0] : book.bids[0];
  const depth = (level?.price ?? 0) * (level?.size ?? 0);
  if (depth < DEFAULT_LIMITS.minTopBookLiquidityUsdc) {
    return "insufficient_top_book_liquidity";
  }
  return null;
};

export const checkMarketExpiry = (market: Market): string | null => {
  const expiresAt = Number(new Date(market.endDate));
  if (Number.isNaN(expiresAt) || expiresAt - Date.now() < 12 * ONE_HOUR_MS) {
    return "market_expiry_too_close";
  }
  return null;
};

export const checkDuplicatePosition = (conditionId: string, state: BotState): string | null => {
  if (state.openPositions.some((position) => position.conditionId === conditionId)) {
    return "duplicate_position";
  }
  return null;
};

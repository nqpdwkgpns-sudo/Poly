import type { Market, OrderBook } from "../market/types.js";
import type { Signal } from "../strategy/types.js";
import {
  checkConcentration,
  checkDailyLossLimit,
  checkDuplicatePosition,
  checkMarketExpiry,
  checkMaxOpenPositions,
  checkMaxPositionSize,
  checkMinLiquidity
} from "./limits.js";
import type { BotState } from "./state.js";

export class RiskEngine {
  public approve(
    signal: Signal,
    state: BotState,
    market: Market,
    book: OrderBook
  ): { approved: boolean; reason?: string } {
    const checks = [
      checkDailyLossLimit(state),
      checkMaxOpenPositions(state),
      checkMaxPositionSize(signal),
      checkConcentration(signal, state, market.category),
      checkMinLiquidity(book, signal.side),
      checkMarketExpiry(market),
      checkDuplicatePosition(signal.conditionId, state)
    ];
    const failed = checks.find((check) => Boolean(check));
    if (failed) {
      return { approved: false, reason: failed };
    }
    return { approved: true };
  }
}

import type { Market, OrderBook } from '../market/types.js';
import type { Signal } from '../strategy/types.js';
import { CircuitBreaker } from './circuitBreaker.js';
import {
  checkConcentration,
  checkDailyLossLimit,
  checkDuplicatePosition,
  checkMarketExpiry,
  checkMaxOpenPositions,
  checkMaxPositionSize,
  checkMinLiquidity,
  type LimitResult
} from './limits.js';
import type { BotState } from './state.js';

export interface RiskDecision {
  approved: boolean;
  reason?: string;
}

export class RiskEngine {
  constructor(private readonly circuitBreaker = new CircuitBreaker()) {}

  approve(signal: Signal, state: BotState, market: Market, book: OrderBook): RiskDecision {
    if (!this.circuitBreaker.canSubmitOrder()) return { approved: false, reason: `circuit breaker ${this.circuitBreaker.status}` };
    const checks: LimitResult[] = [
      checkDailyLossLimit(state),
      checkMaxOpenPositions(state),
      checkMaxPositionSize(signal),
      checkConcentration(signal, state),
      checkMinLiquidity(book, signal),
      checkMarketExpiry(market),
      checkDuplicatePosition(signal.conditionId, state)
    ];
    const failed = checks.find((check) => !check.ok);
    return failed ? { approved: false, reason: failed.reason } : { approved: true };
  }
}

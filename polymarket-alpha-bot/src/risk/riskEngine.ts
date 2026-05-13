import { child } from '../monitoring/logger.js';
import { Market, OrderBook } from '../market/types.js';
import { Signal } from '../strategy/types.js';
import { BotState } from './state.js';
import {
  checkConcentration,
  checkDailyLossLimit,
  checkDuplicatePosition,
  checkMarketExpiry,
  checkMaxOpenPositions,
  checkMaxPositionSize,
  checkMinLiquidity,
} from './limits.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { getDrawdown } from './drawdownTracker.js';

const log = child('riskEngine');

export interface ApprovalResult {
  approved: boolean;
  reason?: string;
  sized?: number;
}

export interface ApprovalInputs {
  signal: Signal;
  market: Market;
  book: OrderBook;
  sizedUsdc?: number;
}

export class RiskEngine {
  constructor(
    private state: BotState,
    private breaker: CircuitBreaker,
  ) {}

  attachState(state: BotState): void {
    this.state = state;
    this.breaker.attachState(state);
  }

  approve(input: ApprovalInputs): ApprovalResult {
    if (this.breaker.isOpen()) {
      return { approved: false, reason: `circuit_breaker_open:${this.state.circuitBreakerReason ?? ''}` };
    }
    const { signal, market, book, sizedUsdc } = input;
    const dd = getDrawdown(this.state);
    if (dd.exceeded) {
      this.breaker.trip('drawdown', `${(dd.drawdownPct * 100).toFixed(1)}%`);
      return { approved: false, reason: `drawdown ${(dd.drawdownPct * 100).toFixed(1)}%` };
    }

    const checks = [
      checkDailyLossLimit(this.state),
      checkMaxOpenPositions(this.state),
      checkMaxPositionSize(signal, sizedUsdc),
      checkMinLiquidity(book, signal.side),
      checkMarketExpiry(market),
      checkDuplicatePosition(signal.conditionId, this.state),
      checkConcentration(signal, this.state, market),
    ];

    for (const c of checks) {
      if (!c.ok) {
        log.debug({ strategy: signal.strategy, reason: c.reason }, 'signal rejected');
        return { approved: false, reason: c.reason };
      }
    }

    if (this.breaker.getState() === 'HALF_OPEN' && !this.breaker.consumeTestSlot()) {
      return { approved: false, reason: 'half_open_test_slot_consumed' };
    }

    return { approved: true, sized: sizedUsdc ?? signal.sizing };
  }
}

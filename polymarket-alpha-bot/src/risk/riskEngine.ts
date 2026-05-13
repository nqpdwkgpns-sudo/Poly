import { Signal } from '../strategy/types';
import { Market, OrderBook } from '../market/types';
import { BotState } from './state';
import {
  checkDailyLossLimit,
  checkMaxOpenPositions,
  checkMaxPositionSize,
  checkConcentration,
  checkMinLiquidity,
  checkMarketExpiry,
  checkDuplicatePosition,
} from './limits';
import { CircuitBreaker } from './circuitBreaker';
import { logger } from '../monitoring/logger';
import { getMarketCategory } from '../market/marketFilter';

export interface RiskApproval {
  approved: boolean;
  reason?: string;
}

export class RiskEngine {
  private circuitBreaker: CircuitBreaker;

  constructor(circuitBreaker: CircuitBreaker) {
    this.circuitBreaker = circuitBreaker;
  }

  approve(
    signal: Signal,
    state: BotState,
    book: OrderBook,
    market: Market,
    openConditionIds: Set<string>
  ): RiskApproval {
    // Circuit breaker check first
    if (!this.circuitBreaker.canExecute()) {
      return {
        approved: false,
        reason: `Circuit breaker is ${state.circuitBreakerStatus}: ${state.circuitBreakerReason ?? 'unknown reason'}`,
      };
    }

    const checks = [
      checkDailyLossLimit(state),
      checkMaxOpenPositions(state),
      checkMaxPositionSize(signal),
      checkConcentration(signal, state, getMarketCategory(market)),
      checkMinLiquidity(book, signal.side),
      checkMarketExpiry(market),
      checkDuplicatePosition(signal.conditionId, state, openConditionIds),
    ];

    for (const check of checks) {
      if (!check.passed) {
        logger.debug(
          { conditionId: signal.conditionId, strategy: signal.strategyName, reason: check.reason },
          'Signal rejected by risk engine'
        );
        return { approved: false, reason: check.reason };
      }
    }

    logger.info(
      {
        conditionId: signal.conditionId,
        strategy: signal.strategyName,
        edge: signal.edge,
        confidence: signal.confidence,
        sizing: signal.sizing,
      },
      'Signal approved by risk engine'
    );

    return { approved: true };
  }
}

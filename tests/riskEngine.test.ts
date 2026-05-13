import { describe, expect, it } from 'vitest';
import type { Market, OrderBook } from '../src/market/types.js';
import { CircuitBreaker } from '../src/risk/circuitBreaker.js';
import { DrawdownTracker } from '../src/risk/drawdownTracker.js';
import { checkDailyLossLimit, checkDuplicatePosition, checkMarketExpiry, checkMinLiquidity } from '../src/risk/limits.js';
import { defaultState } from '../src/risk/state.js';
import type { Signal } from '../src/strategy/types.js';

describe('risk limits', () => {
  it('detects daily loss limit breach', () => {
    const state = defaultState();
    state.dailyRealizedPnl = -250;
    expect(checkDailyLossLimit(state).ok).toBe(false);
  });

  it('rejects duplicate positions', () => {
    const state = defaultState();
    state.openPositions.push({ conditionId: 'c1', tokenId: 't1', marketQuestion: 'q', category: 'crypto', side: 'BUY', entryPrice: 0.5, currentPrice: 0.5, size: 100, openedAt: new Date().toISOString(), realizedPnl: 0, unrealizedPnl: 0 });
    expect(checkDuplicatePosition('c1', state).ok).toBe(false);
  });

  it('rejects markets expiring too soon', () => {
    expect(checkMarketExpiry(market({ endDate: new Date(Date.now() + 2 * 3600_000).toISOString() })).ok).toBe(false);
  });

  it('rejects thin top-of-book liquidity', () => {
    expect(checkMinLiquidity(book(0.5, 100), signal()).ok).toBe(false);
  });
});

describe('circuit breaker and drawdown', () => {
  it('opens after repeated failed orders', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.shouldOpenForState({ failedOrders: 3, dailyLossBreached: false, rpcErrorsLastMinute: 0 })).toContain('failed');
  });

  it('calculates drawdown accurately', () => {
    const tracker = new DrawdownTracker(1_000);
    expect(tracker.getDrawdown(800)).toBeCloseTo(0.2);
  });
});

function signal(): Signal {
  return { conditionId: 'c1', tokenId: 't1', marketQuestion: 'q', category: 'crypto', strategy: 'test', side: 'BUY', impliedProbability: 0.6, marketProbability: 0.5, edge: 0.1, confidence: 0.8, sizing: 100 };
}

function book(price: number, size: number): OrderBook {
  return { tokenId: 't1', bids: [{ price, size }], asks: [{ price: price + 0.02, size }], timestamp: Date.now() };
}

function market(overrides: Partial<Market>): Market {
  return { id: 'm1', conditionId: 'c1', question: 'q', category: 'crypto', endDate: new Date(Date.now() + 86_400_000).toISOString(), active: true, closed: false, resolved: false, volume24h: 20_000, liquidity: 10_000, outcomes: [], tokenIds: [], ...overrides };
}

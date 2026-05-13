import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkDailyLossLimit,
  checkMaxOpenPositions,
  checkMaxPositionSize,
  checkConcentration,
  checkMinLiquidity,
  checkMarketExpiry,
  checkDuplicatePosition,
  getDailyLossUtilization,
  getPositionUtilization,
} from '../src/risk/limits';
import type { BotState } from '../src/risk/state';
import type { Signal } from '../src/strategy/types';
import type { OrderBook } from '../src/market/types';
import type { Market } from '../src/market/types';

function makeState(overrides: Partial<BotState> = {}): BotState {
  return {
    balanceUsdc: 1000,
    peakBalance: 1200,
    openPositionCount: 3,
    dailyRealizedPnl: -50,
    dailyStartBalance: 1000,
    totalRealizedPnl: 100,
    circuitBreakerStatus: 'CLOSED',
    circuitBreakerOpenedAt: null,
    circuitBreakerReason: null,
    consecutiveFailedOrders: 0,
    drawdownPct: 0.05,
    lastResetDate: '2026-05-13',
    startedAt: new Date().toISOString(),
    categoryExposure: { politics: 100, crypto: 100 },
    rpcErrorCount: 0,
    rpcErrorWindowStart: Date.now(),
    ...overrides,
  };
}

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    conditionId: 'test-condition',
    tokenId: 'test-token',
    side: 'BUY',
    impliedProbability: 0.6,
    marketProbability: 0.5,
    edge: 0.1,
    confidence: 0.7,
    sizing: 50,
    strategyName: 'test',
    reasoning: '',
    ...overrides,
  };
}

function makeBook(bidDepth = 1000, askDepth = 1000): OrderBook {
  return {
    tokenId: 'test',
    bids: [{ price: 0.45, size: bidDepth / 0.45 }],
    asks: [{ price: 0.55, size: askDepth / 0.55 }],
    bestBid: 0.45,
    bestAsk: 0.55,
    midPrice: 0.5,
    spread: 0.1,
    timestamp: Date.now(),
  };
}

function makeMarket(hoursToExpiry = 48): Market {
  return {
    conditionId: 'test',
    questionId: 'q1',
    slug: 'test',
    question: 'Will X happen?',
    description: '',
    category: 'politics',
    subcategory: '',
    outcomes: [
      { tokenId: 'token1', outcome: 'Yes', price: 0.5 },
      { tokenId: 'token2', outcome: 'No', price: 0.5 },
    ],
    endDate: new Date(Date.now() + hoursToExpiry * 3600000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    volume: 100000,
    volume24h: 20000,
    liquidity: 5000,
    active: true,
    closed: false,
    archived: false,
    resolved: false,
    resolutionSource: '',
    tags: [],
  };
}

describe('Risk Engine Limits', () => {
  describe('checkDailyLossLimit', () => {
    it('passes when daily P&L is above limit', () => {
      const state = makeState({ dailyRealizedPnl: -50 });
      expect(checkDailyLossLimit(state).passed).toBe(true);
    });

    it('fails when daily P&L hits limit', () => {
      const state = makeState({ dailyRealizedPnl: -200 });
      expect(checkDailyLossLimit(state).passed).toBe(false);
    });

    it('fails when daily P&L exceeds limit', () => {
      const state = makeState({ dailyRealizedPnl: -250 });
      const result = checkDailyLossLimit(state);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Daily loss limit');
    });
  });

  describe('checkMaxOpenPositions', () => {
    it('passes when under limit', () => {
      const state = makeState({ openPositionCount: 5 });
      expect(checkMaxOpenPositions(state).passed).toBe(true);
    });

    it('fails at max', () => {
      const state = makeState({ openPositionCount: 10 });
      expect(checkMaxOpenPositions(state).passed).toBe(false);
    });

    it('fails over max', () => {
      const state = makeState({ openPositionCount: 15 });
      expect(checkMaxOpenPositions(state).passed).toBe(false);
    });
  });

  describe('checkMaxPositionSize', () => {
    it('passes for small signal size', () => {
      const signal = makeSignal({ sizing: 100 });
      expect(checkMaxPositionSize(signal).passed).toBe(true);
    });

    it('fails for oversized signal', () => {
      const signal = makeSignal({ sizing: 600 });
      expect(checkMaxPositionSize(signal).passed).toBe(false);
    });

    it('passes at exactly max', () => {
      const signal = makeSignal({ sizing: 500 });
      expect(checkMaxPositionSize(signal).passed).toBe(true);
    });
  });

  describe('checkConcentration', () => {
    it('passes when category exposure is low', () => {
      // politics = 20, crypto = 180, total = 200; adding 10 → politics = 30 / 210 = 14.3% < 40%
      const state = makeState({ categoryExposure: { politics: 20, crypto: 180 } });
      const signal = makeSignal({ sizing: 10 });
      expect(checkConcentration(signal, state, 'politics').passed).toBe(true);
    });

    it('fails when category exceeds 40%', () => {
      // politics = 400, crypto = 100, total = 500; adding 100 → politics = 500 / 600 = 83% > 40%
      const state = makeState({ categoryExposure: { politics: 400, crypto: 100 } });
      const signal = makeSignal({ sizing: 100 });
      const result = checkConcentration(signal, state, 'politics');
      expect(result.passed).toBe(false);
    });
  });

  describe('checkMinLiquidity', () => {
    it('passes with sufficient depth on BUY side', () => {
      const book = makeBook(100, 1000);
      expect(checkMinLiquidity(book, 'BUY').passed).toBe(true);
    });

    it('fails with insufficient depth on BUY side', () => {
      const book = makeBook(1000, 100);
      expect(checkMinLiquidity(book, 'BUY').passed).toBe(false);
    });

    it('passes with sufficient depth on SELL side', () => {
      const book = makeBook(1000, 100);
      expect(checkMinLiquidity(book, 'SELL').passed).toBe(true);
    });
  });

  describe('checkMarketExpiry', () => {
    it('passes for market expiring in 2 days', () => {
      const market = makeMarket(48);
      expect(checkMarketExpiry(market).passed).toBe(true);
    });

    it('fails for market expiring in 6 hours', () => {
      const market = makeMarket(6);
      expect(checkMarketExpiry(market).passed).toBe(false);
    });

    it('passes at exactly 12 hours', () => {
      const market = makeMarket(13);
      expect(checkMarketExpiry(market).passed).toBe(true);
    });
  });

  describe('checkDuplicatePosition', () => {
    it('passes for new market', () => {
      const openIds = new Set(['other-market']);
      expect(checkDuplicatePosition('new-market', makeState(), openIds).passed).toBe(true);
    });

    it('fails for existing position', () => {
      const openIds = new Set(['test-condition']);
      expect(checkDuplicatePosition('test-condition', makeState(), openIds).passed).toBe(false);
    });
  });

  describe('utilization helpers', () => {
    it('getDailyLossUtilization returns 0 for no loss', () => {
      expect(getDailyLossUtilization(makeState({ dailyRealizedPnl: 50 }))).toBe(0);
    });

    it('getDailyLossUtilization returns 0.5 for half the limit', () => {
      expect(getDailyLossUtilization(makeState({ dailyRealizedPnl: -100 }))).toBeCloseTo(0.5, 5);
    });

    it('getPositionUtilization returns correct fraction', () => {
      expect(getPositionUtilization(makeState({ openPositionCount: 5 }))).toBeCloseTo(0.5, 5);
    });
  });
});

describe('Circuit Breaker', () => {
  it('starts in CLOSED state', async () => {
    const { CircuitBreaker } = await import('../src/risk/circuitBreaker');
    const state = makeState();
    const cb = new CircuitBreaker(state);
    expect(cb.isClosed()).toBe(true);
    expect(cb.isOpen()).toBe(false);
  });

  it('opens after consecutive failures', async () => {
    const { CircuitBreaker } = await import('../src/risk/circuitBreaker');
    const state = makeState();
    const cb = new CircuitBreaker(state);

    cb.recordOrderFailure();
    expect(cb.isOpen()).toBe(false);
    cb.recordOrderFailure();
    expect(cb.isOpen()).toBe(false);
    cb.recordOrderFailure();
    expect(cb.isOpen()).toBe(true);
  });

  it('closes after successful order in HALF_OPEN state', async () => {
    const { CircuitBreaker } = await import('../src/risk/circuitBreaker');
    const state = makeState();
    const cb = new CircuitBreaker(state);

    // Force to HALF_OPEN
    state.circuitBreakerStatus = 'HALF_OPEN';
    cb.recordOrderSuccess();

    expect(cb.isClosed()).toBe(true);
  });

  it('resets consecutive failure count on success', async () => {
    const { CircuitBreaker } = await import('../src/risk/circuitBreaker');
    const state = makeState();
    const cb = new CircuitBreaker(state);

    cb.recordOrderFailure();
    cb.recordOrderFailure();
    cb.recordOrderSuccess();
    expect(state.consecutiveFailedOrders).toBe(0);
  });
});

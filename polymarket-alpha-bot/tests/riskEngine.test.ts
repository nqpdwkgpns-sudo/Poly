import { describe, it, expect, beforeEach } from 'vitest';
import { BotState, emptyState } from '../src/risk/state.js';
import { CircuitBreaker } from '../src/risk/circuitBreaker.js';
import { RiskEngine } from '../src/risk/riskEngine.js';
import {
  checkDailyLossLimit,
  checkMaxOpenPositions,
  checkMaxPositionSize,
  checkMinLiquidity,
  checkMarketExpiry,
  checkDuplicatePosition,
} from '../src/risk/limits.js';
import { updateDrawdown } from '../src/risk/drawdownTracker.js';
import { Market, OrderBook, Position } from '../src/market/types.js';
import { Signal } from '../src/strategy/types.js';

function makeMarket(over: Partial<Market> = {}): Market {
  return {
    conditionId: '0xc1',
    id: '1',
    question: 'q',
    category: 'crypto',
    endDate: new Date(Date.now() + 7 * 86400_000).toISOString(),
    resolved: false,
    active: true,
    closed: false,
    volume: 1_000_000,
    volume24h: 500_000,
    liquidity: 100_000,
    outcomes: [
      { tokenId: 'y', name: 'Yes', price: 0.5 },
      { tokenId: 'n', name: 'No', price: 0.5 },
    ],
    yesTokenId: 'y',
    noTokenId: 'n',
    ...over,
  };
}

function makeBook(buyDepth = 1000, sellDepth = 1000): OrderBook {
  return {
    tokenId: 'y',
    bids: [{ price: 0.49, size: buyDepth }],
    asks: [{ price: 0.51, size: sellDepth }],
    timestamp: Date.now(),
  };
}

function makeSignal(over: Partial<Signal> = {}): Signal {
  return {
    conditionId: '0xc1',
    tokenId: 'y',
    side: 'BUY',
    impliedProbability: 0.6,
    marketProbability: 0.5,
    edge: 0.1,
    confidence: 1,
    sizing: 100,
    strategy: 'test',
    price: 0.5,
    ts: 0,
    ...over,
  };
}

describe('hard limit checks', () => {
  let state: BotState;
  beforeEach(() => {
    state = emptyState();
    state.balanceUsdc = 1000;
  });

  it('daily loss limit fires when crossed', () => {
    state.realizedPnlToday = -250;
    expect(checkDailyLossLimit(state).ok).toBe(false);
    state.realizedPnlToday = -50;
    expect(checkDailyLossLimit(state).ok).toBe(true);
  });

  it('max open positions limit', () => {
    state.positions = Array.from({ length: 10 }, (_, i) => ({
      conditionId: String(i),
    } as unknown as Position));
    expect(checkMaxOpenPositions(state).ok).toBe(false);
  });

  it('max position size limit', () => {
    const s = makeSignal({ sizing: 9999 });
    expect(checkMaxPositionSize(s).ok).toBe(false);
  });

  it('min liquidity requires top depth >= 500 USDC', () => {
    expect(checkMinLiquidity(makeBook(100, 100), 'BUY').ok).toBe(false);
    expect(checkMinLiquidity(makeBook(1000, 1000), 'BUY').ok).toBe(true);
  });

  it('rejects markets expiring soon', () => {
    const m = makeMarket({ endDate: new Date(Date.now() + 60_000).toISOString() });
    expect(checkMarketExpiry(m).ok).toBe(false);
  });

  it('rejects duplicate positions', () => {
    state.positions = [{ conditionId: '0xc1' } as unknown as Position];
    expect(checkDuplicatePosition('0xc1', state).ok).toBe(false);
  });
});

describe('CircuitBreaker', () => {
  it('opens after 3 consecutive failures and can reset', () => {
    const state = emptyState();
    const cb = new CircuitBreaker(state);
    cb.recordOrderFailure();
    cb.recordOrderFailure();
    expect(cb.isOpen()).toBe(false);
    cb.recordOrderFailure();
    expect(cb.isOpen()).toBe(true);
    cb.reset();
    expect(cb.isOpen()).toBe(false);
  });

  it('rpc error rate trips the breaker', () => {
    const state = emptyState();
    const cb = new CircuitBreaker(state);
    for (let i = 0; i < 15; i++) cb.recordRpcError();
    expect(cb.isOpen()).toBe(true);
  });
});

describe('drawdown tracker', () => {
  it('records peak and current drawdown', () => {
    const state = emptyState();
    state.balanceUsdc = 1000;
    updateDrawdown(state, 1000);
    expect(state.peakBalanceUsdc).toBe(1000);
    const dd = updateDrawdown(state, 850);
    expect(dd.drawdownPct).toBeCloseTo(0.15, 3);
    expect(dd.exceeded).toBe(false);
    const dd2 = updateDrawdown(state, 700);
    expect(dd2.exceeded).toBe(true);
  });
});

describe('RiskEngine.approve', () => {
  it('rejects when breaker is open', () => {
    const state = emptyState();
    const cb = new CircuitBreaker(state);
    cb.trip('manual', 'test');
    const engine = new RiskEngine(state, cb);
    const r = engine.approve({
      signal: makeSignal(),
      market: makeMarket(),
      book: makeBook(),
      sizedUsdc: 100,
    });
    expect(r.approved).toBe(false);
    expect(r.reason).toContain('circuit_breaker_open');
  });

  it('approves a clean signal', () => {
    const state = emptyState();
    const cb = new CircuitBreaker(state);
    const engine = new RiskEngine(state, cb);
    const r = engine.approve({
      signal: makeSignal(),
      market: makeMarket(),
      book: makeBook(),
      sizedUsdc: 100,
    });
    expect(r.approved).toBe(true);
  });
});

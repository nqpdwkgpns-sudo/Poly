import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../src/risk/circuitBreaker.js";
import { DrawdownTracker } from "../src/risk/drawdownTracker.js";
import { RiskEngine } from "../src/risk/riskEngine.js";
import type { BotState } from "../src/risk/state.js";
import type { Market, OrderBook } from "../src/market/types.js";
import type { Signal } from "../src/strategy/types.js";

const baseState: BotState = {
  balanceUsdc: 1000,
  openPositions: [],
  dailyRealizedPnl: 0,
  drawdownPct: 0,
  circuitBreakerStatus: "CLOSED",
  lastDailyResetAt: new Date().toISOString(),
  consecutiveFailedOrders: 0,
  rpcErrorsInLastMinute: 0,
  concentrationByCategory: {},
  signalAudit: [],
  pnlHistory: []
};

const signal: Signal = {
  conditionId: "cond",
  tokenId: "token",
  side: "BUY",
  impliedProbability: 0.55,
  marketProbability: 0.48,
  edge: 0.07,
  confidence: 0.6,
  sizing: 100,
  strategy: "test"
};

const market: Market = {
  conditionId: "cond",
  question: "Will test pass?",
  category: "crypto",
  endDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  active: true,
  closed: false,
  volume24h: 20_000,
  outcomes: [],
  tokenIds: ["token", "token2"]
};

const book: OrderBook = {
  tokenId: "token",
  bids: [{ price: 0.45, size: 1500 }],
  asks: [{ price: 0.46, size: 1500 }],
  timestamp: Date.now()
};

describe("risk engine", () => {
  it("approves healthy signal/state", () => {
    const engine = new RiskEngine();
    expect(engine.approve(signal, baseState, market, book).approved).toBe(true);
  });

  it("rejects on daily loss breach", () => {
    const engine = new RiskEngine();
    const breached = { ...baseState, dailyRealizedPnl: -10_000 };
    const result = engine.approve(signal, breached, market, book);
    expect(result.approved).toBe(false);
    expect(result.reason).toBe("daily_loss_limit_breached");
  });
});

describe("circuit breaker transitions", () => {
  it("opens when metrics exceed threshold", () => {
    const breaker = new CircuitBreaker();
    breaker.maybeOpenFromMetrics({
      consecutiveFailedOrders: 3,
      dailyLossLimitBreached: false,
      rpcErrorsPerMinute: 0
    });
    expect(breaker.getState()).toBe("OPEN");
  });
});

describe("drawdown tracker", () => {
  it("calculates drawdown accurately", () => {
    const breaker = new CircuitBreaker();
    const tracker = new DrawdownTracker(1000, breaker);
    tracker.update(900);
    expect(tracker.getDrawdown()).toBeCloseTo(0.1, 5);
  });
});

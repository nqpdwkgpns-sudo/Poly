import cron from 'node-cron';
import { config, assertTradingReady } from './config/env.js';
import { LOOP_INTERVALS, POLYMARKET_CONTRACTS } from './config/constants.js';
import { child } from './monitoring/logger.js';
import { telegramAlerter } from './monitoring/telegramAlerter.js';
import { createApiServer, PnlPoint } from './monitoring/apiServer.js';
import { gammaClient } from './market/gammaClient.js';
import { clobClient } from './market/clobClient.js';
import { wsClient } from './market/wsClient.js';
import { filterTradeable, rankByVolume } from './market/marketFilter.js';
import { signalAggregator } from './strategy/signalAggregator.js';
import { momentumReversal } from './strategy/strategies/momentumReversal.js';
import { sizePosition } from './strategy/kellyEngine.js';
import { spreadAdjustedProb } from './strategy/probabilityEngine.js';
import { PhantomAdapter, getPhantomAdapter } from './wallet/phantomAdapter.js';
import { buildAndSignLimitOrder } from './wallet/orderSigner.js';
import { attachClobAuth } from './wallet/clobAuth.js';
import { orderManager } from './execution/orderManager.js';
import { positionTracker } from './execution/positionTracker.js';
import { BotState, loadState, saveState, resetDailyStats, nextMidnightUtc } from './risk/state.js';
import { CircuitBreaker } from './risk/circuitBreaker.js';
import { RiskEngine } from './risk/riskEngine.js';
import { updateDrawdown, getDrawdown } from './risk/drawdownTracker.js';
import { Market } from './market/types.js';

const log = child('runtime');

export interface RuntimeDeps {
  onShutdown?: (fn: () => Promise<void> | void) => void;
}

const MIN_USDC_BALANCE = 50;

const pnlHistory: PnlPoint[] = [];

function recordPnl(state: BotState): void {
  const pnl = positionTracker.getPnl();
  pnlHistory.push({ ts: Date.now(), ...pnl });
  while (pnlHistory.length > 10_000) pnlHistory.shift();
  state.realizedPnlTotal = pnl.realized;
}

async function emergencyCloseAll(adapter: PhantomAdapter): Promise<{ closed: number }> {
  log.warn('EMERGENCY CLOSE: cancelling all orders and closing positions');
  await orderManager.cancelAllOrders(adapter.getAddress());
  const positions = positionTracker.getAll();
  let closed = 0;
  for (const p of positions) {
    try {
      const { mid } = await clobClient.fetchMarketPrice(p.tokenId);
      positionTracker.closePosition(p.conditionId, mid);
      closed++;
    } catch (err) {
      log.error({ conditionId: p.conditionId, err: (err as Error).message }, 'emergency close failed');
    }
  }
  return { closed };
}

export async function runBot(deps: RuntimeDeps = {}): Promise<void> {
  const onShutdown = deps.onShutdown ?? (() => undefined);

  // -------- 1. Startup sequence --------
  const state = await loadState();
  await positionTracker.load();

  let adapter: PhantomAdapter | null = null;
  try {
    assertTradingReady();
    adapter = getPhantomAdapter();
    attachClobAuth(adapter);
    state.balanceUsdc = await adapter.getUsdcBalance();
    if (state.balanceUsdc < MIN_USDC_BALANCE) {
      log.error(
        { balance: state.balanceUsdc, min: MIN_USDC_BALANCE },
        'usdc balance below minimum — bot will run in observe-only mode',
      );
    } else {
      await adapter.checkAndApprove(POLYMARKET_CONTRACTS.CTF_EXCHANGE);
    }
  } catch (err) {
    log.warn(
      { err: (err as Error).message },
      'trading wallet unavailable; running in observe-only mode',
    );
  }

  const observeOnly = adapter === null || state.balanceUsdc < MIN_USDC_BALANCE;

  const breaker = new CircuitBreaker(state);
  const riskEngine = new RiskEngine(state, breaker);

  wsClient.on('trade', (t) => momentumReversal.recordTrade(t));
  wsClient.on('orderbook_update', (book) => {
    for (const p of positionTracker.getAll()) {
      if (p.tokenId === book.tokenId) {
        const mid = (book.bids[0]?.price ?? 0 + (book.asks[0]?.price ?? 0)) / 2;
        positionTracker.markPosition(p.conditionId, mid || p.currentPrice);
      }
    }
  });
  wsClient.connect();

  breaker.on('open', (info) =>
    telegramAlerter.sendAlert({
      type: 'circuit_breaker_open',
      message: 'circuit breaker tripped',
      data: info as Record<string, unknown>,
    }),
  );
  breaker.on('reset', () =>
    telegramAlerter.sendAlert({ type: 'circuit_breaker_reset', message: 'circuit breaker reset' }),
  );

  const api = createApiServer({
    state: () => state,
    pnlHistory: () => pnlHistory,
    emergencyClose: async () => {
      if (!adapter) return { closed: 0 };
      return emergencyCloseAll(adapter);
    },
  });
  api.start();

  await telegramAlerter.sendAlert({
    type: 'startup',
    message: observeOnly ? 'bot started in OBSERVE-ONLY mode' : 'bot started',
    data: {
      balance: state.balanceUsdc.toFixed(2),
      positions: positionTracker.getAll().length,
      max_position: config.MAX_POSITION_USDC,
      daily_loss_limit: config.DAILY_LOSS_LIMIT_USDC,
    },
  });

  // -------- 2. Main scan loop --------
  const scanLoop = async (): Promise<void> => {
    try {
      if (breaker.isOpen()) {
        log.debug('scan skipped (breaker open)');
        return;
      }
      const all = await gammaClient.fetchActiveMarkets({ limit: 100 });
      const tradeable = rankByVolume(filterTradeable(all)).slice(0, 40);
      log.info({ total: all.length, tradeable: tradeable.length }, 'scan tick');

      const allSignals = [];
      for (const m of tradeable) {
        const tokenId = m.yesTokenId ?? m.outcomes[0]?.tokenId;
        if (!tokenId) continue;
        try {
          const cached = wsClient.getBook(tokenId);
          const book = cached ?? (await clobClient.fetchOrderBook(tokenId));
          const sig = await signalAggregator.analyzeMarket(m, book);
          if (sig) allSignals.push({ market: m, book, signal: sig });
        } catch (err) {
          log.debug(
            { conditionId: m.conditionId, err: (err as Error).message },
            'market scan error',
          );
        }
      }

      const ranked = signalAggregator.rank(allSignals.map((s) => s.signal));
      const top = ranked.slice(0, 5);
      log.info({ candidates: ranked.length, top: top.length }, 'signals ranked');

      for (const sig of top) {
        const ctx = allSignals.find((s) => s.signal.conditionId === sig.conditionId);
        if (!ctx) continue;
        await executeSignal(ctx.market, ctx.book.tokenId, sig, state, riskEngine, adapter, observeOnly);
      }
    } catch (err) {
      log.error({ err: (err as Error).message }, 'scan loop failed');
    }
  };

  const scanTask = cron.schedule(`*/${Math.max(1, Math.floor(LOOP_INTERVALS.SCAN_MS / 1000))} * * * * *`, scanLoop);

  // -------- 3. Position monitor loop --------
  const monitorLoop = async (): Promise<void> => {
    try {
      const positions = positionTracker.getAll();
      for (const p of positions) {
        try {
          const { mid } = await clobClient.fetchMarketPrice(p.tokenId);
          const marked = positionTracker.markPosition(p.conditionId, mid);
          if (!marked) continue;
          const pnlPct =
            marked.side === 'BUY'
              ? (mid - marked.entryPrice) / marked.entryPrice
              : (marked.entryPrice - mid) / marked.entryPrice;
          const profitTarget = config.PROFIT_TARGET_PCT ?? 0.15;
          const stopLoss = config.STOP_LOSS_PCT ?? 0.08;
          if (pnlPct >= profitTarget || pnlPct <= -stopLoss) {
            log.info({ conditionId: p.conditionId, pnlPct }, 'closing position (target/stop)');
            await closePosition(p.conditionId, p.tokenId, marked.side, mid, adapter, observeOnly);
            await telegramAlerter.sendAlert({
              type: 'order_filled',
              message: pnlPct >= 0 ? 'profit target' : 'stop loss',
              data: { market: marked.market, pnlPct: pnlPct.toFixed(3) },
            });
          }
        } catch (err) {
          log.warn({ conditionId: p.conditionId, err: (err as Error).message }, 'monitor tick failed');
        }
      }
      recordPnl(state);
      logPositionTable(positions);
    } catch (err) {
      log.error({ err: (err as Error).message }, 'monitor loop failed');
    }
  };

  const monitorTask = cron.schedule(
    `*/${Math.max(1, Math.floor(LOOP_INTERVALS.POSITION_MONITOR_MS / 1000))} * * * * *`,
    monitorLoop,
  );

  // -------- 4. Risk monitor loop --------
  const riskLoop = async (): Promise<void> => {
    try {
      if (adapter) state.balanceUsdc = await safeBalance(adapter, state.balanceUsdc);
      const dd = updateDrawdown(state, state.balanceUsdc + positionTracker.getNetExposure());
      const dailyPct = Math.abs(state.realizedPnlToday) / (config.DAILY_LOSS_LIMIT_USDC ?? 200);
      const ddPct = dd.drawdownPct / (config.MAX_DRAWDOWN_PCT ?? 0.2);
      if (dailyPct >= 0.8 || ddPct >= 0.8) {
        await telegramAlerter.sendAlert({
          type: 'risk_warning',
          message: 'risk limit > 80% utilized',
          data: {
            dailyPct: dailyPct.toFixed(2),
            ddPct: ddPct.toFixed(2),
            balance: state.balanceUsdc.toFixed(2),
          },
        });
      }
      // Daily reset
      if (Date.now() >= state.dailyResetTs) resetDailyStats(state);
      await saveState(state);
    } catch (err) {
      log.error({ err: (err as Error).message }, 'risk loop failed');
    }
  };

  const riskTask = cron.schedule(
    `*/${Math.max(1, Math.floor(LOOP_INTERVALS.RISK_MONITOR_MS / 1000))} * * * * *`,
    riskLoop,
  );

  // Daily P&L summary at 23:50 UTC
  const pnlSummary = cron.schedule('50 23 * * *', async () => {
    const pnl = positionTracker.getPnl();
    await telegramAlerter.sendAlert({
      type: 'pnl_summary',
      message: 'daily pnl summary',
      data: {
        realized: pnl.realized.toFixed(2),
        unrealized: pnl.unrealized.toFixed(2),
        total: pnl.total.toFixed(2),
        positions: positionTracker.getAll().length,
        balance: state.balanceUsdc.toFixed(2),
      },
    });
  });

  // -------- 5. Graceful shutdown --------
  onShutdown(async () => {
    scanTask.stop();
    monitorTask.stop();
    riskTask.stop();
    pnlSummary.stop();
    api.stop();
    try {
      if (adapter) await orderManager.cancelAllOrders(adapter.getAddress());
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'cancel-all on shutdown failed');
    }
    await saveState(state);
    await positionTracker.save();
    const pnl = positionTracker.getPnl();
    await telegramAlerter.sendAlert({
      type: 'shutdown',
      message: 'bot stopping',
      data: { realized: pnl.realized.toFixed(2), unrealized: pnl.unrealized.toFixed(2) },
    });
    wsClient.close();
  });

  log.info(
    {
      observeOnly,
      balance: state.balanceUsdc,
      positions: positionTracker.getAll().length,
      dailyResetTs: new Date(state.dailyResetTs).toISOString(),
    },
    'bot loops running',
  );
}

async function safeBalance(adapter: PhantomAdapter, fallback: number): Promise<number> {
  try {
    return await adapter.getUsdcBalance();
  } catch {
    return fallback;
  }
}

async function executeSignal(
  market: Market,
  tokenId: string,
  signal: ReturnType<typeof Object>,
  state: BotState,
  risk: RiskEngine,
  adapter: PhantomAdapter | null,
  observeOnly: boolean,
): Promise<void> {
  try {
    const s = signal as import('./strategy/types.js').Signal;
    const balance = state.balanceUsdc + positionTracker.getNetExposure();
    const sizing = sizePosition(s, balance);
    if (sizing.size <= 0) {
      signalAggregator.recordOutcome(s, false, `sizing_${sizing.cappedBy}`);
      return;
    }
    const approval = risk.approve({ signal: s, market, book: { tokenId, bids: [], asks: [], timestamp: 0 }, sizedUsdc: sizing.size });
    signalAggregator.recordOutcome(s, approval.approved, approval.reason);
    if (!approval.approved) return;

    if (observeOnly || !adapter) {
      log.info(
        { conditionId: market.conditionId, strategy: s.strategy, edge: s.edge, size: sizing.size },
        'observe-only: would submit order',
      );
      positionTracker.openPosition(market, tokenId, s.side, s.price, sizing.size);
      return;
    }

    const breakEven = spreadAdjustedProb({ tokenId, bids: [], asks: [], timestamp: 0 }, s.side);
    log.debug({ breakEven, signal: s }, 'pre-trade');

    const signed = await buildAndSignLimitOrder(
      { tokenId, side: s.side, price: s.price, size: sizing.size },
      adapter,
    );
    const st = await orderManager.submitOrder(signed, {
      tokenId,
      side: s.side,
      price: s.price,
      size: sizing.size,
    });
    positionTracker.openPosition(market, tokenId, s.side, s.price, sizing.size);
    state.categoryExposure[market.category] = (state.categoryExposure[market.category] ?? 0) + sizing.size;
    await telegramAlerter.sendAlert({
      type: 'order_filled',
      message: 'order submitted',
      data: { market: market.question, side: s.side, price: s.price, size: sizing.size, orderId: st.order.orderId },
    });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'executeSignal failed');
  }
}

async function closePosition(
  conditionId: string,
  tokenId: string,
  side: 'BUY' | 'SELL',
  price: number,
  adapter: PhantomAdapter | null,
  observeOnly: boolean,
): Promise<void> {
  const offsetSide = side === 'BUY' ? 'SELL' : 'BUY';
  const pos = positionTracker.get(conditionId);
  if (!pos) return;
  try {
    if (!observeOnly && adapter) {
      const signed = await buildAndSignLimitOrder(
        { tokenId, side: offsetSide, price, size: pos.size },
        adapter,
      );
      await orderManager.submitOrder(signed, {
        tokenId,
        side: offsetSide,
        price,
        size: pos.size,
      });
    }
    positionTracker.closePosition(conditionId, price);
  } catch (err) {
    log.error({ conditionId, err: (err as Error).message }, 'closePosition failed');
  }
}

function logPositionTable(positions: ReturnType<typeof positionTracker.getAll>): void {
  if (positions.length === 0) return;
  log.info(
    {
      table: positions.map((p) => ({
        market: p.market.slice(0, 40),
        side: p.side,
        entry: p.entryPrice.toFixed(3),
        mark: p.currentPrice.toFixed(3),
        pnl: p.unrealizedPnl.toFixed(2),
        size: p.size.toFixed(2),
      })),
    },
    'positions',
  );
}

// Re-export for tests
export { nextMidnightUtc };

import cron from 'node-cron';
import { config } from './config/env';
import { logger } from './monitoring/logger';
import { telegramAlerter } from './monitoring/telegramAlerter';
import { createApiServer, updateSharedState, registerEmergencyClose } from './monitoring/apiServer';
import { loadState, saveState, resetDailyStats, shouldResetDaily } from './risk/state';
import { CircuitBreaker } from './risk/circuitBreaker';
import { DrawdownTracker } from './risk/drawdownTracker';
import { RiskEngine } from './risk/riskEngine';
import { phantomAdapter } from './wallet/phantomAdapter';
import { buildLimitOrder, signOrder } from './wallet/orderSigner';
import { orderManager } from './execution/orderManager';
import { positionTracker } from './execution/positionTracker';
import { wsClient } from './market/wsClient';
import { fetchActiveMarkets } from './market/gammaClient';
import { fetchOrderBook } from './market/clobClient';
import { filterTradeable, rankByVolume } from './market/marketFilter';
import { aggregateSignals } from './strategy/signalAggregator';
import { sizePosition } from './strategy/kellyEngine';
import {
  getDailyLossUtilization,
  getPositionUtilization,
} from './risk/limits';
import {
  MAIN_LOOP_INTERVAL_SEC,
  POSITION_MONITOR_INTERVAL_SEC,
  RISK_MONITOR_INTERVAL_SEC,
} from './config/constants';
import type { PnlEntry } from './monitoring/apiServer';
import type { AggregatedSignal } from './strategy/signalAggregator';

const MIN_USDC_BALANCE = 50;
const RISK_WARNING_THRESHOLD = 0.80;

const botStartTime = Date.now();
const pnlHistory: PnlEntry[] = [];
const recentSignals: AggregatedSignal[] = [];

async function main(): Promise<void> {
  logger.info('Polymarket Alpha Bot starting...');

  let state = loadState();
  const circuitBreaker = new CircuitBreaker(state);
  const drawdownTracker = new DrawdownTracker(state, circuitBreaker);
  const riskEngine = new RiskEngine(circuitBreaker);

  // Validate wallet + check balance
  const walletAddress = phantomAdapter.getAddress();
  logger.info({ address: walletAddress }, 'Wallet initialized');

  let usdcBalance: number;
  try {
    usdcBalance = await phantomAdapter.getUsdcBalance();
    logger.info({ balance: usdcBalance }, 'USDC balance fetched');
  } catch (err) {
    logger.error({ err }, 'Failed to fetch USDC balance');
    process.exit(1);
  }

  if (usdcBalance < MIN_USDC_BALANCE) {
    logger.error({ balance: usdcBalance, minimum: MIN_USDC_BALANCE }, 'Insufficient USDC balance — halting');
    process.exit(1);
  }

  // Approve USDC for CTF Exchange
  try {
    await phantomAdapter.checkAndApprove();
    logger.info('USDC approval verified');
  } catch (err) {
    logger.warn({ err }, 'USDC approval check failed — continuing');
  }

  // Initialize state
  state.balanceUsdc = usdcBalance;
  if (state.peakBalance < usdcBalance) state.peakBalance = usdcBalance;
  if (!state.dailyStartBalance) state.dailyStartBalance = usdcBalance;
  drawdownTracker.updateBalance(usdcBalance);

  // Start WebSocket
  wsClient.connect();
  wsClient.on('connected', () => logger.info('WebSocket connected'));
  wsClient.on('disconnected', () => logger.warn('WebSocket disconnected'));
  wsClient.on('error', (err) => logger.error({ err }, 'WebSocket error'));

  // Start API server
  createApiServer(config.API_PORT);
  registerEmergencyClose(async () => {
    logger.warn('Emergency close triggered via API');
    await orderManager.cancelAllOrders();
    const openPositions = positionTracker.getOpenPositions();
    for (const p of openPositions) {
      await positionTracker.closePosition(p.conditionId).catch((e) =>
        logger.error({ e, conditionId: p.conditionId }, 'Failed to close position in emergency')
      );
    }
  });

  // Log startup summary
  const openPositions = positionTracker.getOpenPositions();
  logger.info(
    {
      balance: usdcBalance,
      openPositions: openPositions.length,
      maxPositions: config.MAX_OPEN_POSITIONS,
      maxPosition: config.MAX_POSITION_USDC,
      dailyLossLimit: config.DAILY_LOSS_LIMIT_USDC,
    },
    'Startup complete'
  );

  await telegramAlerter.sendStartup(usdcBalance, openPositions.length);

  // ──────────────────────────────────────────────
  // Main scan loop — every 30 seconds
  // ──────────────────────────────────────────────
  const runMainLoop = async (): Promise<void> => {
    try {
      // Check daily reset
      if (shouldResetDaily(state)) {
        state = resetDailyStats(state);
        saveState(state);
        logger.info('Daily stats reset');
      }

      const markets = await fetchActiveMarkets({ limit: 200 }).catch((err) => {
        logger.error({ err }, 'Failed to fetch markets');
        return [];
      });

      const tradeable = rankByVolume(filterTradeable(markets)).slice(0, 50);
      logger.info({ total: markets.length, tradeable: tradeable.length }, 'Markets fetched');

      // Subscribe WebSocket to all tokenIds
      const tokenIds = tradeable.flatMap((m) => m.outcomes.map((o) => o.tokenId));
      wsClient.subscribe(tokenIds);

      const signals = await aggregateSignals(tradeable, async (tokenId) => {
        const cached = wsClient.getOrderBook(tokenId);
        if (cached && Date.now() - cached.timestamp < 30000) return cached;
        return fetchOrderBook(tokenId);
      });

      // Update shared signals
      recentSignals.unshift(...signals);
      if (recentSignals.length > 50) recentSignals.splice(50);

      const openConditionIds = new Set(positionTracker.getOpenPositions().map((p) => p.conditionId));

      for (const signal of signals.slice(0, 5)) {
        const market = tradeable.find((m) => m.conditionId === signal.conditionId);
        if (!market) continue;

        try {
          const book = wsClient.getOrderBook(signal.tokenId) ?? await fetchOrderBook(signal.tokenId);
          const approval = riskEngine.approve(signal, state, book, market, openConditionIds);

          if (!approval.approved) {
            logger.debug({ conditionId: signal.conditionId, reason: approval.reason }, 'Signal rejected');
            continue;
          }

          const size = sizePosition(signal, state.balanceUsdc);
          if (size < 1) continue;

          const order = buildLimitOrder({
            tokenId: signal.tokenId,
            side: signal.side,
            price: signal.side === 'BUY' ? book.bestAsk : book.bestBid,
            size,
          });

          const signedOrder = await signOrder(order);

          try {
            const orderId = await orderManager.submitOrder(signedOrder, signal.side === 'BUY' ? book.bestAsk : book.bestBid, size);
            positionTracker.openPosition(market, signal.side, signal.side === 'BUY' ? book.bestAsk : book.bestBid, size, orderId);

            state.openPositionCount = positionTracker.getOpenPositions().length;
            state.categoryExposure = positionTracker.getExposureByCategory();
            state.balanceUsdc -= size;
            openConditionIds.add(signal.conditionId);

            circuitBreaker.recordOrderSuccess();
            saveState(state);

            logger.info({ orderId, conditionId: signal.conditionId, size, side: signal.side }, 'Order placed successfully');
          } catch (err) {
            circuitBreaker.recordOrderFailure();
            logger.error({ err, conditionId: signal.conditionId }, 'Order submission failed');
          }
        } catch (err) {
          logger.error({ err, conditionId: signal.conditionId }, 'Error processing signal');
        }
      }

      updateSharedState({
        state,
        positions: positionTracker.getOpenPositions(),
        signals: recentSignals,
        pnlHistory,
        uptime: Date.now() - botStartTime,
      });
    } catch (err) {
      logger.error({ err }, 'Main loop error');
    }
  };

  // ──────────────────────────────────────────────
  // Position monitor loop — every 60 seconds
  // ──────────────────────────────────────────────
  const runPositionMonitor = async (): Promise<void> => {
    try {
      let usdcBal: number;
      try {
        usdcBal = await phantomAdapter.getUsdcBalance();
        state.balanceUsdc = usdcBal;
        drawdownTracker.updateBalance(usdcBal);
      } catch (err) {
        circuitBreaker.recordRpcError();
        logger.error({ err }, 'Failed to fetch balance in position monitor');
        return;
      }

      // Update prices for all positions
      for (const position of positionTracker.getOpenPositions()) {
        try {
          const book = wsClient.getOrderBook(position.tokenId) ?? await fetchOrderBook(position.tokenId);
          positionTracker.updatePrice(position.conditionId, book.midPrice);
        } catch (err) {
          logger.debug({ err, conditionId: position.conditionId }, 'Price update failed for position');
        }
      }

      // Check exit conditions
      const toClose = positionTracker.checkExitConditions();
      for (const conditionId of toClose) {
        try {
          await positionTracker.closePosition(conditionId);
          const pnl = positionTracker.getPnl();
          state.dailyRealizedPnl = pnl.realized;
          state.totalRealizedPnl += pnl.realized;
          circuitBreaker.checkDailyLossBreach(state.dailyRealizedPnl, config.DAILY_LOSS_LIMIT_USDC);
        } catch (err) {
          logger.error({ err, conditionId }, 'Failed to close position');
        }
      }

      state.openPositionCount = positionTracker.getOpenPositions().length;
      state.categoryExposure = positionTracker.getExposureByCategory();
      saveState(state);

      // Log position table
      const positions = positionTracker.getOpenPositions();
      if (positions.length > 0) {
        logger.info({ positions: positions.map((p) => ({
          market: p.marketQuestion.slice(0, 40),
          side: p.side,
          entry: p.entryPrice.toFixed(3),
          current: p.currentPrice.toFixed(3),
          pnl: p.unrealizedPnl.toFixed(2),
          size: p.size.toFixed(2),
        }))}, 'Open positions');
      }
    } catch (err) {
      logger.error({ err }, 'Position monitor error');
    }
  };

  // ──────────────────────────────────────────────
  // Risk monitor loop — every 10 seconds
  // ──────────────────────────────────────────────
  const runRiskMonitor = async (): Promise<void> => {
    try {
      const dailyLossUtil = getDailyLossUtilization(state);
      const positionUtil = getPositionUtilization(state);
      const drawdown = drawdownTracker.getDrawdown();

      if (dailyLossUtil > RISK_WARNING_THRESHOLD) {
        await telegramAlerter.sendLimitWarning('Daily Loss', dailyLossUtil);
      }

      if (positionUtil > RISK_WARNING_THRESHOLD) {
        await telegramAlerter.sendLimitWarning('Open Positions', positionUtil);
      }

      if (drawdown > 0.15) {
        await telegramAlerter.sendLimitWarning('Drawdown', drawdown);
      }

      // Update shared state for dashboard
      updateSharedState({
        state,
        uptime: Date.now() - botStartTime,
      });
    } catch (err) {
      logger.error({ err }, 'Risk monitor error');
    }
  };

  // Schedule all loops using cron
  cron.schedule(`*/${MAIN_LOOP_INTERVAL_SEC} * * * * *`, runMainLoop);
  cron.schedule(`*/${POSITION_MONITOR_INTERVAL_SEC} * * * * *`, runPositionMonitor);
  cron.schedule(`*/${RISK_MONITOR_INTERVAL_SEC} * * * * *`, runRiskMonitor);

  // Daily P&L summary at 23:50 UTC
  cron.schedule('50 23 * * *', async () => {
    const pnl = positionTracker.getPnl();
    pnlHistory.push({
      date: new Date().toISOString().slice(0, 10),
      pnl: state.dailyRealizedPnl,
      cumulative: state.totalRealizedPnl,
    });
    await telegramAlerter.sendDailyPnlSummary(state.dailyRealizedPnl, state.totalRealizedPnl, state.balanceUsdc);
    logger.info({ daily: state.dailyRealizedPnl, total: pnl.total }, 'Daily P&L summary');
  });

  // Run first iteration immediately
  await runMainLoop();

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received — graceful shutdown starting');

    try {
      await orderManager.cancelAllOrders();
      positionTracker.saveToDisk();
      saveState(state);

      const pnl = positionTracker.getPnl();
      logger.info({ realizedPnl: pnl.realized, unrealizedPnl: pnl.unrealized, totalPnl: pnl.total }, 'Final P&L summary');

      wsClient.disconnect();
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    shutdown('uncaughtException').catch(() => process.exit(1));
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});

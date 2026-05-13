import cron from "node-cron";
import { config } from "./config/env.js";
import { GammaClient } from "./market/gammaClient.js";
import { ClobClient } from "./market/clobClient.js";
import { filterTradeable, rankByVolume } from "./market/marketFilter.js";
import { WsClient } from "./market/wsClient.js";
import { OrderManager } from "./execution/orderManager.js";
import { PositionTracker } from "./execution/positionTracker.js";
import { PhantomAdapter } from "./wallet/phantomAdapter.js";
import { OrderSigner } from "./wallet/orderSigner.js";
import { LiquidityFadeStrategy } from "./strategy/strategies/liquidityFade.js";
import { MomentumReversalStrategy } from "./strategy/strategies/momentumReversal.js";
import { NewsCalibrationStrategy } from "./strategy/strategies/newsCalibration.js";
import { SpreadArbitrageStrategy } from "./strategy/strategies/spreadArbitrage.js";
import { SignalAggregator } from "./strategy/signalAggregator.js";
import { sizePosition } from "./strategy/kellyEngine.js";
import { RiskEngine } from "./risk/riskEngine.js";
import { CircuitBreaker } from "./risk/circuitBreaker.js";
import { DrawdownTracker } from "./risk/drawdownTracker.js";
import { loadState, resetDailyStats, saveState, type BotState } from "./risk/state.js";
import { TelegramAlerter } from "./monitoring/telegramAlerter.js";
import { logger } from "./monitoring/logger.js";
import { buildApiServer } from "./monitoring/apiServer.js";
import type { Market, OrderBook } from "./market/types.js";
import type { Signal } from "./strategy/types.js";

const gammaClient = new GammaClient();
const clobClient = new ClobClient();
const wsClient = new WsClient();
const phantomAdapter = new PhantomAdapter();
const orderSigner = new OrderSigner(phantomAdapter);
const orderManager = new OrderManager(clobClient);
const positionTracker = new PositionTracker();
const riskEngine = new RiskEngine();
const circuitBreaker = new CircuitBreaker();
const telegram = new TelegramAlerter();
const momentum = new MomentumReversalStrategy();
const signalAggregator = new SignalAggregator([
  new SpreadArbitrageStrategy(),
  new LiquidityFadeStrategy(),
  momentum,
  new NewsCalibrationStrategy()
]);

let botState: BotState;
let running = true;
let latestSignals: Signal[] = [];
let server: ReturnType<typeof buildApiServer> | null = null;

const recordSignal = (market: Market, signal: Signal, approved: boolean, reason?: string) => {
  botState.signalAudit.push({
    timestamp: Date.now(),
    marketQuestion: market.question,
    strategy: signal.strategy,
    edge: signal.edge,
    approved,
    reason
  });
  botState.signalAudit = botState.signalAudit.slice(-200);
};

const getBookForMarket = async (market: Market): Promise<OrderBook | null> => {
  const tokenId = market.tokenIds[0];
  if (!tokenId) {
    return null;
  }
  const cached = wsClient.getOrderBook(tokenId);
  if (cached) {
    return cached;
  }
  return clobClient.fetchOrderBook(tokenId);
};

const startup = async (): Promise<void> => {
  botState = await loadState();
  await positionTracker.load();
  botState.openPositions = [...positionTracker.getOpenPositions().values()];

  const walletAddress = await phantomAdapter.getAddress();
  orderManager.setOwnerAddress(walletAddress);
  botState.balanceUsdc = await phantomAdapter.getUsdcBalance();
  if (botState.balanceUsdc < 50) {
    throw new Error("USDC balance below required $50 minimum");
  }
  await phantomAdapter.checkAndApprove();

  wsClient.connect();
  wsClient.on("trade", (event) => {
    momentum.ingestTrade(event.trade);
  });

  const drawdownTracker = new DrawdownTracker(botState.balanceUsdc, circuitBreaker);
  circuitBreaker.on("open", async (reason: string) => {
    botState.circuitBreakerStatus = "OPEN";
    await telegram.sendAlert(`circuit_breaker_open: ${reason}`);
    await orderManager.cancelAllOrders(walletAddress);
  });

  server = buildApiServer({
    getState: () => botState,
    getPositions: () => botState.openPositions,
    getSignals: () => latestSignals,
    getPnl: () => botState.pnlHistory,
    emergencyClose: async () => {
      await orderManager.cancelAllOrders(walletAddress);
      botState.openPositions = [];
      await positionTracker.snapshot();
    }
  });

  logger.info({
    balanceUsdc: botState.balanceUsdc,
    openPositions: botState.openPositions.length,
    maxPositionUsdc: config.MAX_POSITION_USDC,
    maxOpenPositions: config.MAX_OPEN_POSITIONS
  }, "startup complete");
  await telegram.sendAlert(`startup: balance=${botState.balanceUsdc.toFixed(2)} USDC`);

  const scanTask = cron.schedule("*/30 * * * * *", async () => {
    if (!running) {
      return;
    }
    try {
      const markets = rankByVolume(filterTradeable(await gammaClient.fetchActiveMarkets())).slice(0, 30);
      wsClient.subscribe(markets.flatMap((market) => market.tokenIds));

      for (const market of markets) {
        try {
          const book = await getBookForMarket(market);
          if (!book) {
            continue;
          }
          const signals = await signalAggregator.analyze(market, book, 3);
          latestSignals = [...latestSignals, ...signals].slice(-50);

          for (const signal of signals) {
            if (!circuitBreaker.canSubmitOrder()) {
              recordSignal(market, signal, false, "circuit_breaker_open");
              continue;
            }
            const approval = riskEngine.approve(signal, botState, market, book);
            if (!approval.approved) {
              recordSignal(market, signal, false, approval.reason);
              logger.info({ signal, reason: approval.reason }, "signal rejected");
              continue;
            }

            const size = sizePosition(signal, botState.balanceUsdc);
            if (size <= 0) {
              recordSignal(market, signal, false, "kelly_zero_size");
              continue;
            }

            const limitOrder = await orderSigner.buildLimitOrder({
              tokenId: signal.tokenId,
              side: signal.side,
              price: signal.marketProbability,
              size,
              expiration: Math.floor(Date.now() / 1000) + 300
            });
            const signed = await orderSigner.signOrder(limitOrder);
            const orderId = await orderManager.submitOrder({
              tokenId: signal.tokenId,
              side: signal.side,
              price: signal.marketProbability,
              size,
              expiration: limitOrder.expiration,
              signature: signed.signature
            });
            botState.consecutiveFailedOrders = 0;
            const position = positionTracker.openPosition(market, signal.side, signal.marketProbability, size);
            botState.openPositions = [...positionTracker.getOpenPositions().values()];
            recordSignal(market, signal, true, orderId);
            logger.info({ orderId, position }, "signal executed");
          }
        } catch (error) {
          botState.rpcErrorsInLastMinute += 1;
          logger.error({ err: error, conditionId: market.conditionId }, "scan loop market error");
        }
      }
    } catch (error) {
      logger.error({ err: error }, "scan loop failed");
    }
  });

  const positionTask = cron.schedule("*/60 * * * * *", async () => {
    if (!running) {
      return;
    }
    try {
      for (const position of positionTracker.getOpenPositions().values()) {
        const px = await clobClient.fetchMarketPrice(position.tokenId);
        positionTracker.updateMark(position.conditionId, px.mid);
        const sideMultiplier = position.side === "BUY" ? 1 : -1;
        const pnlPct = ((px.mid - position.entryPrice) / position.entryPrice) * sideMultiplier;
        if (pnlPct > 0.15 || pnlPct < -0.08) {
          positionTracker.closePosition(position.conditionId, px.mid);
        }
      }
      const pnl = positionTracker.getPnl();
      botState.dailyRealizedPnl = pnl.realized;
      botState.openPositions = [...positionTracker.getOpenPositions().values()];
      await positionTracker.snapshot();
      logger.info({ positions: botState.openPositions.length, pnl }, "position monitor");
    } catch (error) {
      logger.error({ err: error }, "position monitor loop failed");
    }
  });

  const riskTask = cron.schedule("*/10 * * * * *", async () => {
    if (!running) {
      return;
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      const lastReset = botState.lastDailyResetAt.slice(0, 10);
      if (today !== lastReset) {
        botState = resetDailyStats(botState);
      }

      botState.balanceUsdc = await phantomAdapter.getUsdcBalance();
      drawdownTracker.update(botState.balanceUsdc + positionTracker.getPnl().total);
      botState.drawdownPct = drawdownTracker.getDrawdown();
      botState.circuitBreakerStatus = circuitBreaker.getState();

      circuitBreaker.maybeOpenFromMetrics({
        consecutiveFailedOrders: botState.consecutiveFailedOrders,
        dailyLossLimitBreached: botState.dailyRealizedPnl < -config.DAILY_LOSS_LIMIT_USDC,
        rpcErrorsPerMinute: botState.rpcErrorsInLastMinute
      });

      if (Math.abs(botState.dailyRealizedPnl) > config.DAILY_LOSS_LIMIT_USDC * 0.8) {
        await telegram.sendAlert(`daily_limit_80pct: pnl=${botState.dailyRealizedPnl.toFixed(2)}`);
      }
      if (botState.drawdownPct > 0.15) {
        await telegram.sendAlert(`drawdown_warning: ${(botState.drawdownPct * 100).toFixed(2)}%`);
      }

      botState.rpcErrorsInLastMinute = 0;
      await saveState(botState);
    } catch (error) {
      logger.error({ err: error }, "risk monitor loop failed");
    }
  });

  const dailySummaryTask = cron.schedule("50 23 * * *", async () => {
    const pnl = positionTracker.getPnl();
    await telegram.sendAlert(`pnl_summary: realized=${pnl.realized.toFixed(2)} unrealized=${pnl.unrealized.toFixed(2)}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    running = false;
    scanTask.stop();
    positionTask.stop();
    riskTask.stop();
    dailySummaryTask.stop();

    try {
      await orderManager.cancelAllOrders(await phantomAdapter.getAddress());
      await positionTracker.snapshot();
      await saveState(botState);
      wsClient.disconnect();
      server?.close();
      const pnl = positionTracker.getPnl();
      logger.info({ signal, pnl }, "shutdown complete");
      await telegram.sendAlert(`shutdown pnl: ${pnl.total.toFixed(2)}`);
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "shutdown failed");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
};

startup().catch((error) => {
  logger.fatal({ err: error }, "bot failed on startup");
  process.exit(1);
});

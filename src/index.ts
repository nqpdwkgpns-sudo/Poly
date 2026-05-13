import cron from 'node-cron';
import { config } from './config/env.js';
import { DAILY_RESET_CRON, DAILY_SUMMARY_CRON, MARKET_SCAN_CRON, POSITION_MONITOR_CRON, RISK_MONITOR_CRON } from './config/constants.js';
import { OrderManager } from './execution/orderManager.js';
import { PositionTracker } from './execution/positionTracker.js';
import { ClobClient } from './market/clobClient.js';
import { GammaClient } from './market/gammaClient.js';
import { filterTradeable, rankByVolume } from './market/marketFilter.js';
import { PolymarketWsClient } from './market/wsClient.js';
import { startApiServer } from './monitoring/apiServer.js';
import { logger } from './monitoring/logger.js';
import { TelegramAlerter } from './monitoring/telegramAlerter.js';
import { CircuitBreaker } from './risk/circuitBreaker.js';
import { DrawdownTracker } from './risk/drawdownTracker.js';
import { RiskEngine } from './risk/riskEngine.js';
import { loadState, resetDailyStats, saveState, type BotState } from './risk/state.js';
import { sizePosition } from './strategy/kellyEngine.js';
import { SignalAggregator } from './strategy/signalAggregator.js';
import { PhantomAdapter } from './wallet/phantomAdapter.js';
import { OrderSigner } from './wallet/orderSigner.js';

async function main(): Promise<void> {
  const state = await loadState();
  const alerter = new TelegramAlerter();
  const wallet = new PhantomAdapter();
  const balance = await wallet.getUsdcBalance();
  state.balanceUsdc = balance;
  state.peakBalanceUsdc = Math.max(state.peakBalanceUsdc, balance);
  if (balance < 50) throw new Error(`USDC balance ${balance.toFixed(2)} below minimum 50`);
  await wallet.checkAndApprove();

  const gammaClient = new GammaClient();
  const clobClient = new ClobClient(wallet.wallet);
  const wsClient = new PolymarketWsClient();
  const positionTracker = new PositionTracker();
  await positionTracker.load();
  state.openPositions = [...positionTracker.positions.values()];
  const orderManager = new OrderManager(clobClient, wallet.getAddress());
  const circuitBreaker = new CircuitBreaker(30 * 60_000, orderManager, alerter);
  const riskEngine = new RiskEngine(circuitBreaker);
  const signalAggregator = new SignalAggregator();
  const drawdownTracker = new DrawdownTracker(state.peakBalanceUsdc);

  wsClient.on('trade', (trade) => signalAggregator.observeTrade(trade));
  wsClient.on('error', (error) => logger.warn({ error }, 'websocket error'));
  wsClient.connect();

  const apiServer = startApiServer({ getState: () => state, emergencyClose: () => orderManager.cancelAllOrders() });
  await alerter.sendAlert(`startup balance=${balance.toFixed(2)} positions=${state.openPositions.length}`, 'startup');
  logger.info({ balance, address: wallet.getAddress(), config: publicConfig() }, 'bot startup complete');

  const tasks = [
    cron.schedule(MARKET_SCAN_CRON, () => void runMarketScan({ gammaClient, clobClient, signalAggregator, riskEngine, orderSigner: new OrderSigner(wallet), orderManager, positionTracker, state })),
    cron.schedule(POSITION_MONITOR_CRON, () => void runPositionMonitor({ positionTracker, state })),
    cron.schedule(RISK_MONITOR_CRON, () => void runRiskMonitor({ state, circuitBreaker, drawdownTracker, alerter })),
    cron.schedule(DAILY_RESET_CRON, () => Object.assign(state, resetDailyStats(state))),
    cron.schedule(DAILY_SUMMARY_CRON, () => void alerter.sendAlert(`Daily P&L ${state.dailyRealizedPnl.toFixed(2)} USDC`, 'pnl_summary'))
  ];

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutdown started');
    tasks.forEach((task) => task.stop());
    wsClient.close();
    await orderManager.cancelAllOrders();
    state.openPositions = [...positionTracker.positions.values()];
    await Promise.allSettled([positionTracker.save(), saveState(state), apiServer.close()]);
    logger.info({ pnl: positionTracker.getPnl() }, 'shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

interface ScanDeps {
  gammaClient: GammaClient;
  clobClient: ClobClient;
  signalAggregator: SignalAggregator;
  riskEngine: RiskEngine;
  orderSigner: OrderSigner;
  orderManager: OrderManager;
  positionTracker: PositionTracker;
  state: BotState;
}

async function runMarketScan(deps: ScanDeps): Promise<void> {
  try {
    const markets = rankByVolume(filterTradeable(await deps.gammaClient.fetchActiveMarkets({ limit: 100 }))).slice(0, 25);
    for (const market of markets) {
      for (const tokenId of market.tokenIds.slice(0, 1)) {
        try {
          const book = await deps.clobClient.fetchOrderBook(tokenId);
          const signals = await deps.signalAggregator.analyze(market, book);
          for (const signal of signals) {
            const decision = deps.riskEngine.approve(signal, deps.state, market, book);
            deps.state.lastSignals.push({ ...signal, approved: decision.approved, reason: decision.reason, observedAt: new Date().toISOString() });
            deps.state.lastSignals = deps.state.lastSignals.slice(-50);
            logger.info({ signal, decision }, 'signal considered');
            if (!decision.approved) continue;
            const sized = sizePosition(signal, deps.state.balanceUsdc);
            if (sized <= 0) continue;
            const price = Math.max(0.01, Math.min(0.99, signal.marketProbability));
            const order = deps.orderSigner.buildLimitOrder({ tokenId: signal.tokenId, side: signal.side, price, size: sized });
            const signed = await deps.orderSigner.signOrder(order);
            const orderId = await deps.orderManager.submitOrder(signed);
            deps.state.openOrders.push(orderId);
            await deps.positionTracker.openPosition(market, signal.side, price, sized, signal.tokenId);
            deps.state.openPositions = [...deps.positionTracker.positions.values()];
          }
        } catch (error) {
          logger.warn({ error, market: market.conditionId, tokenId }, 'market scan skipped bad market data');
        }
      }
    }
    await saveState(deps.state);
  } catch (error) {
    logger.error({ error }, 'market scan failed');
  }
}

async function runPositionMonitor(deps: { positionTracker: PositionTracker; state: BotState }): Promise<void> {
  const pnl = deps.positionTracker.getPnl();
  deps.state.openPositions = [...deps.positionTracker.positions.values()];
  deps.state.pnlHistory.push({ date: new Date().toISOString(), pnl: pnl.total });
  deps.state.pnlHistory = deps.state.pnlHistory.slice(-7);
  logger.info({ positions: deps.state.openPositions, pnl }, 'position monitor summary');
  await saveState(deps.state);
}

async function runRiskMonitor(deps: { state: BotState; circuitBreaker: CircuitBreaker; drawdownTracker: DrawdownTracker; alerter: TelegramAlerter }): Promise<void> {
  const now = Date.now();
  deps.state.rpcErrors = deps.state.rpcErrors.filter((timestamp) => now - timestamp <= 60_000);
  deps.drawdownTracker.update(deps.state.balanceUsdc);
  const dailyLossBreached = deps.state.dailyRealizedPnl <= -config.DAILY_LOSS_LIMIT_USDC;
  const reason = deps.circuitBreaker.shouldOpenForState({ failedOrders: deps.state.failedOrders, dailyLossBreached, rpcErrorsLastMinute: deps.state.rpcErrors.length });
  if (reason) await deps.circuitBreaker.open(reason);
  if (deps.drawdownTracker.shouldTrigger(deps.state.balanceUsdc)) await deps.circuitBreaker.open('drawdown exceeds 20%');
  deps.state.circuitBreakerStatus = deps.circuitBreaker.status;
  const dailyUtilization = Math.abs(deps.state.dailyRealizedPnl) / config.DAILY_LOSS_LIMIT_USDC;
  if (dailyUtilization > 0.8) await deps.alerter.sendAlert(`Daily loss utilization ${(dailyUtilization * 100).toFixed(1)}%`, 'daily_limit_hit');
  await saveState(deps.state);
}

function publicConfig(): Record<string, unknown> {
  return {
    clobUrl: config.POLYMARKET_CLOB_URL,
    gammaUrl: config.POLYMARKET_GAMMA_URL,
    maxPositionUsdc: config.MAX_POSITION_USDC,
    maxOpenPositions: config.MAX_OPEN_POSITIONS,
    dailyLossLimitUsdc: config.DAILY_LOSS_LIMIT_USDC,
    paperTrading: config.PAPER_TRADING
  };
}

main().catch((error) => {
  logger.fatal({ error }, 'bot crashed during startup');
  process.exit(1);
});

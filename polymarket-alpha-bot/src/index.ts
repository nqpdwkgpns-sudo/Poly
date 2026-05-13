import { child } from './monitoring/logger.js';
import { config } from './config/env.js';

const log = child('bootstrap');

let shuttingDown = false;
const shutdownHooks: Array<() => Promise<void> | void> = [];

export function onShutdown(fn: () => Promise<void> | void): void {
  shutdownHooks.push(fn);
}

async function gracefulShutdown(signal: NodeJS.Signals | 'fatal'): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.warn({ signal }, 'shutdown signal received, draining...');
  for (const hook of shutdownHooks.reverse()) {
    try {
      await hook();
    } catch (err) {
      log.error({ err }, 'shutdown hook failed');
    }
  }
  log.info('shutdown complete');
  process.exit(signal === 'fatal' ? 1 : 0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  log.error({ err }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'uncaughtException');
  void gracefulShutdown('fatal');
});

async function main(): Promise<void> {
  log.info(
    {
      env: config.NODE_ENV,
      gamma: config.POLYMARKET_GAMMA_URL,
      clob: config.POLYMARKET_CLOB_URL,
      maxPosition: config.MAX_POSITION_USDC,
      kellyFraction: config.KELLY_FRACTION,
      minEdge: config.MIN_EDGE_THRESHOLD,
      maxOpenPositions: config.MAX_OPEN_POSITIONS,
      dailyLossLimit: config.DAILY_LOSS_LIMIT_USDC,
    },
    'polymarket-alpha-bot starting',
  );

  // Full orchestration is wired in src/runtime.ts (built in Part 6)
  const { runBot } = await import('./runtime.js');
  await runBot({ onShutdown });
}

main().catch((err) => {
  log.fatal({ err }, 'fatal startup error');
  void gracefulShutdown('fatal');
});

import express from 'express';
import { BotState } from '../risk/state';
import { Position } from '../execution/positionTracker';
import { AggregatedSignal } from '../strategy/signalAggregator';
import { logger } from './logger';

export interface PnlEntry {
  date: string;
  pnl: number;
  cumulative: number;
}

export interface BotStateSnapshot {
  state: BotState;
  positions: Position[];
  signals: AggregatedSignal[];
  pnlHistory: PnlEntry[];
  uptime: number;
}

let sharedSnapshot: BotStateSnapshot = {
  state: {} as BotState,
  positions: [],
  signals: [],
  pnlHistory: [],
  uptime: 0,
};

let emergencyCloseCallback: (() => Promise<void>) | null = null;

export function updateSharedState(snapshot: Partial<BotStateSnapshot>): void {
  sharedSnapshot = { ...sharedSnapshot, ...snapshot };
}

export function registerEmergencyClose(fn: () => Promise<void>): void {
  emergencyCloseCallback = fn;
}

export function createApiServer(port: number): express.Application {
  const app = express();
  app.use(express.json());

  // CORS for dashboard
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  app.get('/api/state', (_req, res) => {
    res.json({
      ...sharedSnapshot.state,
      uptime: sharedSnapshot.uptime,
      isLive: sharedSnapshot.state.circuitBreakerStatus === 'CLOSED',
    });
  });

  app.get('/api/positions', (_req, res) => {
    res.json(sharedSnapshot.positions);
  });

  app.get('/api/signals', (_req, res) => {
    res.json(sharedSnapshot.signals.slice(0, 50));
  });

  app.get('/api/pnl', (_req, res) => {
    res.json(sharedSnapshot.pnlHistory);
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/emergency-close', async (_req, res) => {
    if (!emergencyCloseCallback) {
      res.status(503).json({ error: 'Emergency close not registered' });
      return;
    }

    try {
      await emergencyCloseCallback();
      res.json({ success: true, message: 'All positions and orders closed' });
    } catch (err) {
      logger.error({ err }, 'Emergency close failed');
      res.status(500).json({ error: 'Emergency close failed' });
    }
  });

  app.listen(port, () => {
    logger.info({ port }, 'API server listening');
  });

  return app;
}

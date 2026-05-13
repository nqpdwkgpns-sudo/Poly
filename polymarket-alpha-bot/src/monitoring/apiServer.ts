import express, { Express, Request, Response } from 'express';
import { child } from './logger.js';
import { config } from '../config/env.js';
import { BotState } from '../risk/state.js';
import { positionTracker } from '../execution/positionTracker.js';
import { signalAggregator } from '../strategy/signalAggregator.js';
import { Signal } from '../strategy/types.js';

const log = child('apiServer');

export interface PnlPoint {
  ts: number;
  realized: number;
  unrealized: number;
  total: number;
}

export interface ApiServerDeps {
  state: () => BotState;
  pnlHistory: () => PnlPoint[];
  emergencyClose: () => Promise<{ closed: number }>;
}

export function createApiServer(deps: ApiServerDeps): { app: Express; start: () => void; stop: () => void } {
  const app = express();
  app.use(express.json());

  app.get('/api/state', (_req: Request, res: Response) => {
    const s = deps.state();
    res.json({
      ...s,
      uptimeMs: Date.now() - s.startedAt,
    });
  });

  app.get('/api/positions', (_req, res) => {
    const positions = positionTracker.getAll();
    const pnl = positionTracker.getPnl();
    res.json({ positions, pnl });
  });

  app.get('/api/signals', (req, res) => {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const recent = signalAggregator.getRecent(limit) as Array<Signal & { approved?: boolean; reason?: string }>;
    res.json(recent);
  });

  app.get('/api/pnl', (req, res) => {
    const days = Math.min(30, Number(req.query.days) || 7);
    const cutoff = Date.now() - days * 86400_000;
    res.json(deps.pnlHistory().filter((p) => p.ts >= cutoff));
  });

  app.post('/api/emergency-close', async (_req, res) => {
    try {
      const result = await deps.emergencyClose();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  let server: ReturnType<Express['listen']> | undefined;
  return {
    app,
    start() {
      const port = config.API_SERVER_PORT ?? 3001;
      server = app.listen(port, () => log.info({ port }, 'api server listening'));
    },
    stop() {
      server?.close();
    },
  };
}

import cors from 'cors';
import express, { type Express } from 'express';
import { config } from '../config/env.js';
import type { BotState } from '../risk/state.js';
import { logger } from './logger.js';

export interface ApiServerOptions {
  getState: () => BotState;
  emergencyClose?: () => Promise<void>;
}

export function createApiServer(options: ApiServerOptions): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/state', (_req, res) => res.json(options.getState()));
  app.get('/api/positions', (_req, res) => res.json(options.getState().openPositions));
  app.get('/api/signals', (_req, res) => res.json(options.getState().lastSignals.slice(-50)));
  app.get('/api/pnl', (_req, res) => res.json(options.getState().pnlHistory.slice(-7)));
  app.post('/api/emergency-close', async (_req, res, next) => {
    try {
      await options.emergencyClose?.();
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ error }, 'api server error');
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  });

  return app;
}

export function startApiServer(options: ApiServerOptions, port = config.API_PORT): { close: () => Promise<void> } {
  const app = createApiServer(options);
  const server = app.listen(port, () => logger.info({ port }, 'monitoring API server listening'));
  return { close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

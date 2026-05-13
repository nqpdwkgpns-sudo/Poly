import express from "express";
import cors from "cors";
import type { BotState } from "../risk/state.js";
import type { Signal } from "../strategy/types.js";

export interface ApiStateProvider {
  getState(): BotState;
  getPositions(): BotState["openPositions"];
  getSignals(): Signal[];
  getPnl(): BotState["pnlHistory"];
  emergencyClose(): Promise<void>;
}

export const buildApiServer = (provider: ApiStateProvider, port = 3001) => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/state", (_req, res) => {
    res.json(provider.getState());
  });

  app.get("/api/positions", (_req, res) => {
    res.json(provider.getPositions());
  });

  app.get("/api/signals", (_req, res) => {
    res.json(provider.getSignals().slice(-50));
  });

  app.get("/api/pnl", (_req, res) => {
    res.json(provider.getPnl().slice(-7));
  });

  app.post("/api/emergency-close", async (_req, res) => {
    await provider.emergencyClose();
    res.json({ ok: true });
  });

  const server = app.listen(port, () => undefined);
  return server;
};

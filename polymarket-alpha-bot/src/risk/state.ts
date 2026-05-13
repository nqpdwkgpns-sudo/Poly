import { promises as fs } from "node:fs";
import path from "node:path";
import type { Position } from "../execution/positionTracker.js";

export interface BotState {
  balanceUsdc: number;
  openPositions: Position[];
  dailyRealizedPnl: number;
  drawdownPct: number;
  circuitBreakerStatus: "CLOSED" | "OPEN" | "HALF_OPEN";
  lastDailyResetAt: string;
  consecutiveFailedOrders: number;
  rpcErrorsInLastMinute: number;
  concentrationByCategory: Record<string, number>;
  signalAudit: Array<{
    timestamp: number;
    marketQuestion: string;
    strategy: string;
    edge: number;
    approved: boolean;
    reason?: string;
  }>;
  pnlHistory: Array<{ date: string; pnl: number }>;
}

const STATE_PATH = path.resolve("data/state.json");

const defaultState = (): BotState => ({
  balanceUsdc: 0,
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
});

export const loadState = async (): Promise<BotState> => {
  try {
    const data = await fs.readFile(STATE_PATH, "utf8");
    return { ...defaultState(), ...(JSON.parse(data) as BotState) };
  } catch {
    return defaultState();
  }
};

export const saveState = async (state: BotState): Promise<void> => {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
};

export const resetDailyStats = (state: BotState): BotState => ({
  ...state,
  dailyRealizedPnl: 0,
  lastDailyResetAt: new Date().toISOString()
});

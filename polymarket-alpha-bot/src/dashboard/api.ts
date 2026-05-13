export interface BotStatePayload {
  balanceUsdc: number;
  peakBalanceUsdc: number;
  realizedPnlToday: number;
  realizedPnlTotal: number;
  dailyResetTs: number;
  circuitBreaker: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  circuitBreakerReason?: string;
  startedAt: number;
  updatedAt: number;
  uptimeMs: number;
  consecutiveOrderFailures: number;
  categoryExposure: Record<string, number>;
  positions: Array<{
    conditionId: string;
    market: string;
    side: 'BUY' | 'SELL';
    entryPrice: number;
    currentPrice: number;
    size: number;
    unrealizedPnl: number;
    category: string;
  }>;
}

export interface PositionsPayload {
  positions: Array<{
    conditionId: string;
    market: string;
    side: 'BUY' | 'SELL';
    entryPrice: number;
    currentPrice: number;
    size: number;
    unrealizedPnl: number;
  }>;
  pnl: { realized: number; unrealized: number; total: number };
}

export interface SignalRow {
  conditionId: string;
  strategy: string;
  side: 'BUY' | 'SELL';
  edge: number;
  confidence: number;
  approved?: boolean;
  reason?: string;
  ts: number;
  rationale?: string;
}

export interface PnlPoint {
  ts: number;
  realized: number;
  unrealized: number;
  total: number;
}

async function jsonGet<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

export const api = {
  state: () => jsonGet<BotStatePayload>('/api/state'),
  positions: () => jsonGet<PositionsPayload>('/api/positions'),
  signals: () => jsonGet<SignalRow[]>('/api/signals?limit=50'),
  pnl: () => jsonGet<PnlPoint[]>('/api/pnl?days=7'),
  emergencyClose: async () => {
    const r = await fetch('/api/emergency-close', { method: 'POST' });
    return r.json() as Promise<{ closed: number }>;
  },
};

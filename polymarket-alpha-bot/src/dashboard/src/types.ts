export interface BotState {
  balanceUsdc: number;
  peakBalance: number;
  openPositionCount: number;
  dailyRealizedPnl: number;
  totalRealizedPnl: number;
  circuitBreakerStatus: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  circuitBreakerReason: string | null;
  drawdownPct: number;
  dailyLossLimitUsdc?: number;
  maxOpenPositions?: number;
  categoryExposure: Record<string, number>;
  isLive: boolean;
  uptime: number;
}

export interface Position {
  conditionId: string;
  tokenId: string;
  marketQuestion: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice: number;
  size: number;
  shares: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openedAt: number;
  category: string;
  status: 'OPEN' | 'CLOSED' | 'CLOSING';
}

export interface Signal {
  conditionId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  impliedProbability: number;
  marketProbability: number;
  edge: number;
  confidence: number;
  sizing: number;
  strategyName: string;
  reasoning: string;
  rank: number;
  score: number;
  approved?: boolean;
  rejectionReason?: string;
}

export interface PnlEntry {
  date: string;
  pnl: number;
  cumulative: number;
}

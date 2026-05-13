export interface SimulatedTrade {
  pnl: number;
  ts: number;
  conditionId: string;
  strategy: string;
  edge: number;
  realizedEdge: number;
}

export function sharpeRatio(returns: number[], periodsPerYear = 365): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(periodsPerYear);
}

export function maxDrawdown(equityCurve: number[]): { drawdown: number; peakIdx: number; troughIdx: number } {
  let peak = -Infinity;
  let peakIdx = 0;
  let maxDd = 0;
  let troughIdx = 0;
  let curPeakIdx = 0;
  equityCurve.forEach((v, i) => {
    if (v > peak) {
      peak = v;
      curPeakIdx = i;
    }
    const dd = peak === 0 ? 0 : (peak - v) / Math.abs(peak);
    if (dd > maxDd) {
      maxDd = dd;
      peakIdx = curPeakIdx;
      troughIdx = i;
    }
  });
  return { drawdown: maxDd, peakIdx, troughIdx };
}

export function winRate(trades: SimulatedTrade[]): number {
  if (trades.length === 0) return 0;
  const wins = trades.filter((t) => t.pnl > 0).length;
  return wins / trades.length;
}

export function profitFactor(trades: SimulatedTrade[]): number {
  const gross = trades.reduce((acc, t) => acc + Math.max(0, t.pnl), 0);
  const loss = trades.reduce((acc, t) => acc + Math.max(0, -t.pnl), 0);
  if (loss === 0) return gross > 0 ? Infinity : 0;
  return gross / loss;
}

export function avgEdgeCapture(trades: SimulatedTrade[]): number {
  if (trades.length === 0) return 0;
  let captured = 0;
  let theoretical = 0;
  for (const t of trades) {
    captured += t.realizedEdge;
    theoretical += Math.abs(t.edge);
  }
  if (theoretical === 0) return 0;
  return captured / theoretical;
}

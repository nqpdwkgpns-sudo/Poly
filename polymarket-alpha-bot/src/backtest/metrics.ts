export const sharpeRatio = (returns: number[]): number => {
  if (returns.length < 2) {
    return 0;
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) {
    return 0;
  }
  return (mean / stdDev) * Math.sqrt(252);
};

export const maxDrawdown = (equityCurve: number[]): number => {
  let peak = equityCurve[0] ?? 0;
  let maxDd = 0;
  equityCurve.forEach((point) => {
    peak = Math.max(peak, point);
    if (peak > 0) {
      maxDd = Math.max(maxDd, (peak - point) / peak);
    }
  });
  return maxDd;
};

export const winRate = (trades: Array<{ pnl: number }>): number => {
  if (trades.length === 0) {
    return 0;
  }
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  return wins / trades.length;
};

export const profitFactor = (trades: Array<{ pnl: number }>): number => {
  const grossProfit = trades.filter((trade) => trade.pnl > 0).reduce((acc, trade) => acc + trade.pnl, 0);
  const grossLoss = Math.abs(trades.filter((trade) => trade.pnl < 0).reduce((acc, trade) => acc + trade.pnl, 0));
  if (grossLoss === 0) {
    return grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return grossProfit / grossLoss;
};

export const avgEdgeCapture = (
  signals: Array<{ edge: number }>,
  fills: Array<{ realizedEdge: number }>
): number => {
  if (signals.length === 0 || fills.length === 0) {
    return 0;
  }
  const theoretical = signals.reduce((acc, signal) => acc + signal.edge, 0);
  if (theoretical === 0) {
    return 0;
  }
  const realized = fills.reduce((acc, fill) => acc + fill.realizedEdge, 0);
  return realized / theoretical;
};

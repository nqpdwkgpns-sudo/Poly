export interface BacktestTrade {
  pnl: number;
}

export function sharpeRatio(returns: number[], periodsPerYear = 365): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  return stdDev === 0 ? 0 : (mean / stdDev) * Math.sqrt(periodsPerYear);
}

export function maxDrawdown(equityCurve: number[]): number {
  let peak = equityCurve[0] ?? 0;
  let max = 0;
  for (const value of equityCurve) {
    peak = Math.max(peak, value);
    if (peak > 0) max = Math.max(max, (peak - value) / peak);
  }
  return max;
}

export function winRate(trades: BacktestTrade[]): number {
  if (trades.length === 0) return 0;
  return trades.filter((trade) => trade.pnl > 0).length / trades.length;
}

export function profitFactor(trades: BacktestTrade[]): number {
  const grossProfit = trades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0));
  return grossLoss === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0) : grossProfit / grossLoss;
}

export function avgEdgeCapture(signals: Array<{ edge: number }>, fills: Array<{ pnl: number; size: number }>): number {
  const theoretical = signals.reduce((sum, signal, index) => sum + signal.edge * (fills[index]?.size ?? 0), 0);
  const actual = fills.reduce((sum, fill) => sum + fill.pnl, 0);
  return theoretical === 0 ? 0 : actual / theoretical;
}

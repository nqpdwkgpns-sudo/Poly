export interface TradeRecord {
  timestamp: number;
  conditionId: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  strategyName: string;
  theoreticalEdge: number;
}

export function sharpeRatio(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  // Annualized: assuming daily returns, 252 trading days
  return (mean / stdDev) * Math.sqrt(252);
}

export function maxDrawdown(equityCurve: number[]): number {
  let peak = equityCurve[0] ?? 0;
  let maxDD = 0;

  for (const value of equityCurve) {
    if (value > peak) peak = value;
    const dd = peak > 0 ? (peak - value) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }

  return maxDD;
}

export function winRate(trades: TradeRecord[]): number {
  if (trades.length === 0) return 0;
  const winners = trades.filter((t) => t.pnl > 0);
  return winners.length / trades.length;
}

export function profitFactor(trades: TradeRecord[]): number {
  const grossProfit = trades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / grossLoss;
}

export function avgEdgeCapture(trades: TradeRecord[]): number {
  if (trades.length === 0) return 0;
  const captures = trades.map((t) => {
    if (t.theoreticalEdge <= 0) return 0;
    return (t.pnl / t.size) / t.theoreticalEdge;
  });
  return captures.reduce((a, b) => a + b, 0) / captures.length;
}

export function totalReturn(equityCurve: number[]): number {
  if (equityCurve.length < 2) return 0;
  const start = equityCurve[0];
  const end = equityCurve[equityCurve.length - 1];
  return start > 0 ? (end - start) / start : 0;
}

export function printSummaryTable(
  trades: TradeRecord[],
  equityCurve: number[],
  startBalance: number
): void {
  const dailyReturns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }

  const metrics = {
    'Total Trades': trades.length,
    'Win Rate': `${(winRate(trades) * 100).toFixed(1)}%`,
    'Profit Factor': profitFactor(trades).toFixed(2),
    'Sharpe Ratio': sharpeRatio(dailyReturns).toFixed(2),
    'Max Drawdown': `${(maxDrawdown(equityCurve) * 100).toFixed(1)}%`,
    'Total Return': `${(totalReturn(equityCurve) * 100).toFixed(1)}%`,
    'Avg Edge Capture': `${(avgEdgeCapture(trades) * 100).toFixed(1)}%`,
    'Final Balance': `$${equityCurve[equityCurve.length - 1]?.toFixed(2) ?? '0.00'}`,
    'Net P&L': `$${(equityCurve[equityCurve.length - 1] - startBalance).toFixed(2)}`,
  };

  console.log('\n════════════════════════════════════════');
  console.log('        BACKTEST RESULTS SUMMARY');
  console.log('════════════════════════════════════════');
  for (const [key, value] of Object.entries(metrics)) {
    console.log(`  ${key.padEnd(20)} ${value}`);
  }
  console.log('════════════════════════════════════════\n');
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { avgEdgeCapture, maxDrawdown, profitFactor, sharpeRatio, winRate } from "./metrics.js";

interface Row {
  timestamp: number;
  conditionId: string;
  midPrice: number;
  volume: number;
}

interface BacktestResult {
  endingEquity: number;
  totalPnl: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  avgEdgeCapture: number;
}

const parseCsv = (content: string): Row[] =>
  content
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [timestamp, conditionId, midPrice, volume] = line.split(",");
      return {
        timestamp: Number(timestamp),
        conditionId: conditionId ?? "",
        midPrice: Number(midPrice),
        volume: Number(volume)
      };
    });

export const runBacktest = async (csvPath: string, slippage = 0.005): Promise<BacktestResult> => {
  const raw = await fs.readFile(csvPath, "utf8");
  const rows = parseCsv(raw).sort((a, b) => a.timestamp - b.timestamp);

  let equity = 10_000;
  const equityCurve = [equity];
  const returns: number[] = [];
  const trades: Array<{ pnl: number }> = [];
  const signals: Array<{ edge: number }> = [];
  const fills: Array<{ realizedEdge: number }> = [];
  const lastPriceByMarket = new Map<string, number>();

  rows.forEach((row) => {
    const prev = lastPriceByMarket.get(row.conditionId);
    if (prev !== undefined) {
      const move = row.midPrice - prev;
      const edge = Math.abs(move) * 0.2;
      const position = Math.min(150, row.volume * 0.001);
      const pnl = move * position - position * slippage;
      equity += pnl;
      trades.push({ pnl });
      signals.push({ edge });
      fills.push({ realizedEdge: Math.max(0, edge - slippage) });
      const dailyReturn = pnl / Math.max(equity - pnl, 1);
      returns.push(dailyReturn);
      equityCurve.push(equity);
    }
    lastPriceByMarket.set(row.conditionId, row.midPrice);
  });

  const result: BacktestResult = {
    endingEquity: equity,
    totalPnl: equity - 10_000,
    sharpe: sharpeRatio(returns),
    maxDrawdown: maxDrawdown(equityCurve),
    winRate: winRate(trades),
    profitFactor: profitFactor(trades),
    avgEdgeCapture: avgEdgeCapture(signals, fills)
  };

  const outputPath = path.resolve("backtest_results.json");
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
  return result;
};

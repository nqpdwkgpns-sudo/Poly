import { readFile, writeFile } from 'node:fs/promises';
import { LiquidityFadeStrategy } from '../strategy/strategies/liquidityFade.js';
import { SignalAggregator } from '../strategy/signalAggregator.js';
import type { Market, OrderBook } from '../market/types.js';
import { avgEdgeCapture, maxDrawdown, profitFactor, sharpeRatio, winRate } from './metrics.js';

interface CsvRow {
  timestamp: number;
  conditionId: string;
  midPrice: number;
  volume: number;
}

interface SimulatedFill {
  pnl: number;
  size: number;
}

export async function runBacktest(csvPath: string, slippage = 0.005): Promise<Record<string, unknown>> {
  const rows = parseCsv(await readFile(csvPath, 'utf8')).sort((a, b) => a.timestamp - b.timestamp);
  const aggregator = new SignalAggregator([new LiquidityFadeStrategy()]);
  const fills: SimulatedFill[] = [];
  const signals: Array<{ edge: number }> = [];
  const equityCurve: number[] = [10_000];
  let balance = 10_000;

  for (const row of rows) {
    const market = marketFromRow(row);
    const book = bookFromRow(row);
    const [signal] = await aggregator.analyze(market, book, 1);
    if (!signal) {
      equityCurve.push(balance);
      continue;
    }
    const fillPrice = signal.side === 'BUY' ? row.midPrice * (1 + slippage) : row.midPrice * (1 - slippage);
    const edgePnl = signal.side === 'BUY' ? signal.edge * signal.sizing : signal.edge * signal.sizing * 0.8;
    const cost = Math.abs(fillPrice - row.midPrice) * signal.sizing;
    const pnl = edgePnl - cost;
    balance += pnl;
    fills.push({ pnl, size: signal.sizing });
    signals.push({ edge: signal.edge });
    equityCurve.push(balance);
  }

  const returns = equityCurve.slice(1).map((value, index) => (value - equityCurve[index]!) / equityCurve[index]!);
  const result = {
    trades: fills.length,
    finalBalance: balance,
    pnl: balance - 10_000,
    winRate: winRate(fills),
    sharpe: sharpeRatio(returns),
    maxDrawdown: maxDrawdown(equityCurve),
    profitFactor: profitFactor(fills),
    avgEdgeCapture: avgEdgeCapture(signals, fills)
  };
  await writeFile('backtest_results.json', JSON.stringify(result, null, 2));
  console.table(result);
  return result;
}

function parseCsv(raw: string): CsvRow[] {
  const [, ...lines] = raw.trim().split(/\r?\n/);
  return lines.map((line) => {
    const [timestamp, conditionId, midPrice, volume] = line.split(',');
    return { timestamp: Date.parse(timestamp ?? ''), conditionId: conditionId ?? '', midPrice: Number(midPrice), volume: Number(volume) };
  }).filter((row) => row.conditionId && Number.isFinite(row.timestamp) && Number.isFinite(row.midPrice));
}

function marketFromRow(row: CsvRow): Market {
  return {
    id: row.conditionId,
    conditionId: row.conditionId,
    question: `Backtest market ${row.conditionId}`,
    category: 'backtest',
    endDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    active: true,
    closed: false,
    resolved: false,
    volume24h: row.volume,
    liquidity: row.volume,
    outcomes: [{ name: 'YES', tokenId: `${row.conditionId}-yes`, price: row.midPrice }, { name: 'NO', tokenId: `${row.conditionId}-no`, price: 1 - row.midPrice }],
    tokenIds: [`${row.conditionId}-yes`, `${row.conditionId}-no`]
  };
}

function bookFromRow(row: CsvRow): OrderBook {
  return {
    tokenId: `${row.conditionId}-yes`,
    bids: [{ price: Math.max(0.01, row.midPrice - 0.04), size: row.volume / 100 }],
    asks: [{ price: Math.min(0.99, row.midPrice + 0.04), size: row.volume / 120 }],
    timestamp: row.timestamp
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const csvPath = process.argv[2];
  if (!csvPath) throw new Error('Usage: pnpm backtest <historical.csv>');
  void runBacktest(csvPath);
}

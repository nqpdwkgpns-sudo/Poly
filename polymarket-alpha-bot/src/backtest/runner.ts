import { promises as fs } from 'node:fs';
import path from 'node:path';
import { child } from '../monitoring/logger.js';
import { SignalAggregator } from '../strategy/signalAggregator.js';
import { Market, OrderBook } from '../market/types.js';
import {
  SimulatedTrade,
  avgEdgeCapture,
  maxDrawdown,
  profitFactor,
  sharpeRatio,
  winRate,
} from './metrics.js';

const log = child('backtest');

interface BacktestRow {
  timestamp: number;
  conditionId: string;
  midPrice: number;
  volume: number;
  question?: string;
  category?: string;
}

interface BacktestOptions {
  csvPath: string;
  slippage?: number;
  outPath?: string;
}

function parseCsv(text: string): BacktestRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const out: BacktestRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const row: BacktestRow = {
      timestamp: Number(cols[idx('timestamp')]) || 0,
      conditionId: cols[idx('conditionid')] ?? '',
      midPrice: Number(cols[idx('midprice')]) || 0,
      volume: Number(cols[idx('volume')]) || 0,
      question: cols[idx('question')],
      category: cols[idx('category')],
    };
    if (row.conditionId) out.push(row);
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

function mockMarket(row: BacktestRow): Market {
  return {
    conditionId: row.conditionId,
    id: row.conditionId,
    question: row.question ?? `historical ${row.conditionId}`,
    category: (row.category as Market['category']) ?? 'other',
    endDate: new Date(row.timestamp + 30 * 86400_000).toISOString(),
    resolved: false,
    active: true,
    closed: false,
    volume: row.volume,
    volume24h: row.volume,
    liquidity: row.volume,
    outcomes: [
      { tokenId: `${row.conditionId}-y`, name: 'Yes', price: row.midPrice },
      { tokenId: `${row.conditionId}-n`, name: 'No', price: 1 - row.midPrice },
    ],
    yesTokenId: `${row.conditionId}-y`,
    noTokenId: `${row.conditionId}-n`,
  };
}

function mockBook(row: BacktestRow): OrderBook {
  const half = 0.005;
  return {
    tokenId: `${row.conditionId}-y`,
    bids: [{ price: Math.max(0.01, row.midPrice - half), size: 1000 }],
    asks: [{ price: Math.min(0.99, row.midPrice + half), size: 1000 }],
    timestamp: row.timestamp,
  };
}

export async function runBacktest(opts: BacktestOptions): Promise<void> {
  const slippage = opts.slippage ?? 0.005;
  const text = await fs.readFile(opts.csvPath, 'utf8');
  const rows = parseCsv(text);
  log.info({ rows: rows.length, slippage }, 'backtest starting');

  const aggregator = new SignalAggregator();
  const trades: SimulatedTrade[] = [];
  const equity: number[] = [];
  let capital = 1000;
  const lastRowByCondition = new Map<string, BacktestRow>();

  for (const row of rows) {
    const m = mockMarket(row);
    const b = mockBook(row);
    const sig = await aggregator.analyzeMarket(m, b);
    if (sig && sig.edge >= 0.03) {
      const entryPrice = sig.side === 'BUY' ? b.asks[0].price * (1 + slippage) : b.bids[0].price * (1 - slippage);
      const exitRow = lastRowByCondition.get(row.conditionId);
      const exitPrice = exitRow ? exitRow.midPrice : row.midPrice;
      const pnl =
        sig.side === 'BUY'
          ? (exitPrice - entryPrice) * 100
          : (entryPrice - exitPrice) * 100;
      const realizedEdge = sig.side === 'BUY' ? exitPrice - entryPrice : entryPrice - exitPrice;
      capital += pnl;
      trades.push({
        pnl,
        ts: row.timestamp,
        conditionId: row.conditionId,
        strategy: sig.strategy,
        edge: sig.edge,
        realizedEdge,
      });
    }
    lastRowByCondition.set(row.conditionId, row);
    equity.push(capital);
  }

  const returns = trades.map((t) => t.pnl / 1000);
  const summary = {
    trades: trades.length,
    finalCapital: capital,
    winRate: winRate(trades),
    profitFactor: profitFactor(trades),
    sharpe: sharpeRatio(returns),
    maxDrawdown: maxDrawdown(equity).drawdown,
    avgEdgeCapture: avgEdgeCapture(trades),
  };

  const out = opts.outPath ?? 'data/backtest_results.json';
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify({ summary, trades }, null, 2));

  console.log('\n=== backtest summary ===');
  for (const [k, v] of Object.entries(summary)) {
    console.log(`${k.padEnd(18)} ${typeof v === 'number' ? v.toFixed(4) : v}`);
  }
}

const isMain = process.argv[1] && process.argv[1].includes('backtest/runner');
if (isMain) {
  const csv = process.argv[2] ?? 'data/historical.csv';
  runBacktest({ csvPath: csv }).catch((err) => {
    console.error('backtest failed:', err);
    process.exit(1);
  });
}

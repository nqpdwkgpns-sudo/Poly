import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import readline from 'readline';
import { TradeRecord, printSummaryTable, winRate, profitFactor, sharpeRatio, maxDrawdown, avgEdgeCapture } from './metrics';

interface MarketSnapshot {
  timestamp: number;
  conditionId: string;
  midPrice: number;
  volume: number;
}

interface BacktestConfig {
  startBalance: number;
  slippagePct: number;
  csvPath: string;
  maxPositionUsdc: number;
  kellyFraction: number;
  minEdgeThreshold: number;
}

const DEFAULT_CONFIG: BacktestConfig = {
  startBalance: 1000,
  slippagePct: 0.005,
  csvPath: './data/historical.csv',
  maxPositionUsdc: 500,
  kellyFraction: 0.25,
  minEdgeThreshold: 0.03,
};

async function loadCsv(csvPath: string): Promise<MarketSnapshot[]> {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const snapshots: MarketSnapshot[] = [];
  const rl = readline.createInterface({
    input: createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }

    const parts = line.split(',');
    if (parts.length < 4) continue;

    const [timestamp, conditionId, midPrice, volume] = parts;
    snapshots.push({
      timestamp: parseInt(timestamp, 10),
      conditionId: conditionId.trim(),
      midPrice: parseFloat(midPrice),
      volume: parseFloat(volume),
    });
  }

  return snapshots.sort((a, b) => a.timestamp - b.timestamp);
}

function simulateFill(
  price: number,
  side: 'BUY' | 'SELL',
  slippagePct: number
): number {
  const slippage = price * slippagePct;
  return side === 'BUY' ? price + slippage : price - slippage;
}

function simpleEdgeDetection(snapshots: MarketSnapshot[], currentIndex: number): {
  edge: number;
  side: 'BUY' | 'SELL';
  confidence: number;
} | null {
  if (currentIndex < 5) return null;

  const current = snapshots[currentIndex];
  const window = snapshots.slice(Math.max(0, currentIndex - 10), currentIndex);

  const avgPrice = window.reduce((s, w) => s + w.midPrice, 0) / window.length;
  const priceDiff = current.midPrice - avgPrice;
  const pct = Math.abs(priceDiff) / avgPrice;

  if (pct < 0.05) return null;

  // Mean reversion signal
  const side = priceDiff > 0 ? 'SELL' : 'BUY';
  const edge = Math.min(pct * 0.6, 0.15);

  return { edge, side, confidence: Math.min(pct * 3, 0.8) };
}

async function runBacktest(config: BacktestConfig = DEFAULT_CONFIG): Promise<void> {
  console.log(`Loading data from ${config.csvPath}...`);

  let snapshots: MarketSnapshot[];
  try {
    snapshots = await loadCsv(config.csvPath);
  } catch (err) {
    console.error(`Failed to load CSV: ${err instanceof Error ? err.message : err}`);
    console.log('Generating synthetic data for demonstration...');
    snapshots = generateSyntheticData();
  }

  console.log(`Loaded ${snapshots.length} snapshots`);

  let balance = config.startBalance;
  const equityCurve: number[] = [balance];
  const trades: TradeRecord[] = [];
  const openPositions = new Map<string, {
    entryPrice: number;
    side: 'BUY' | 'SELL';
    size: number;
    openedAt: number;
    edge: number;
    strategyName: string;
  }>();

  const groupedByMarket = new Map<string, MarketSnapshot[]>();
  for (const snap of snapshots) {
    const existing = groupedByMarket.get(snap.conditionId) ?? [];
    existing.push(snap);
    groupedByMarket.set(snap.conditionId, existing);
  }

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const marketHistory = groupedByMarket.get(snap.conditionId) ?? [];
    const marketIndex = marketHistory.findIndex((s) => s === snap);

    // Check for exits on open positions
    const position = openPositions.get(snap.conditionId);
    if (position) {
      const pnlPctCalc = position.side === 'BUY'
        ? (snap.midPrice - position.entryPrice) / position.entryPrice
        : (position.entryPrice - snap.midPrice) / position.entryPrice;

      if (pnlPctCalc >= 0.15 || pnlPctCalc <= -0.08) {
        const exitPrice = simulateFill(snap.midPrice, position.side === 'BUY' ? 'SELL' : 'BUY', config.slippagePct);
        const exitValue = position.side === 'BUY'
          ? (position.size / position.entryPrice) * exitPrice
          : position.size - ((position.size / (1 - position.entryPrice)) * (exitPrice));
        const pnl = exitValue - position.size;

        trades.push({
          timestamp: snap.timestamp,
          conditionId: snap.conditionId,
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice,
          size: position.size,
          pnl,
          strategyName: position.strategyName,
          theoreticalEdge: position.edge,
        });

        balance += pnl;
        openPositions.delete(snap.conditionId);
      }
    } else {
      const signal = simpleEdgeDetection(marketHistory, marketIndex);
      if (signal && signal.edge >= config.minEdgeThreshold && !openPositions.has(snap.conditionId)) {
        const odds = (1 - snap.midPrice) / snap.midPrice;
        const kellyPct = (signal.edge / odds) * config.kellyFraction * signal.confidence;
        const size = Math.min(balance * kellyPct, config.maxPositionUsdc, balance * 0.1);

        if (size >= 1 && balance >= size) {
          const entryPrice = simulateFill(snap.midPrice, signal.side, config.slippagePct);
          balance -= size;

          openPositions.set(snap.conditionId, {
            entryPrice,
            side: signal.side,
            size,
            openedAt: snap.timestamp,
            edge: signal.edge,
            strategyName: 'MeanReversion',
          });
        }
      }
    }

    if (i % 100 === 0) {
      equityCurve.push(balance);
    }
  }

  equityCurve.push(balance);
  printSummaryTable(trades, equityCurve, config.startBalance);

  const results = {
    config,
    trades: trades.length,
    finalBalance: balance,
    netPnl: balance - config.startBalance,
    winRate: winRate(trades),
    profitFactor: profitFactor(trades),
    maxDrawdown: maxDrawdown(equityCurve),
    avgEdgeCapture: avgEdgeCapture(trades),
    equityCurve,
    timestamp: new Date().toISOString(),
  };

  const outputPath = './data/backtest_results.json';
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${outputPath}`);
}

function generateSyntheticData(): MarketSnapshot[] {
  const snapshots: MarketSnapshot[] = [];
  const markets = ['market-a', 'market-b', 'market-c'];
  const now = Date.now();

  for (const conditionId of markets) {
    let price = 0.3 + Math.random() * 0.4;
    for (let i = 0; i < 500; i++) {
      price += (Math.random() - 0.5) * 0.02;
      price = Math.max(0.01, Math.min(0.99, price));
      snapshots.push({
        timestamp: now - (500 - i) * 60000,
        conditionId,
        midPrice: price,
        volume: 10000 + Math.random() * 5000,
      });
    }
  }

  return snapshots.sort((a, b) => a.timestamp - b.timestamp);
}

const configArg = process.argv[2];
const config: BacktestConfig = configArg
  ? { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configArg, 'utf-8')) }
  : DEFAULT_CONFIG;

runBacktest(config).catch((err) => {
  console.error('Backtest failed:', err);
  process.exit(1);
});

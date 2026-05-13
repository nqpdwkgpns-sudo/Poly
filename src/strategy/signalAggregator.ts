import { config } from '../config/env.js';
import type { Market, OrderBook, Trade } from '../market/types.js';
import { LiquidityFadeStrategy } from './strategies/liquidityFade.js';
import { MomentumReversalStrategy } from './strategies/momentumReversal.js';
import { NewsCalibrationStrategy } from './strategies/newsCalibration.js';
import { SpreadArbitrageStrategy } from './strategies/spreadArbitrage.js';
import type { Signal, Strategy } from './types.js';

export class SignalAggregator {
  private readonly momentum: MomentumReversalStrategy;
  private readonly strategies: Strategy[];

  constructor(strategies?: Strategy[]) {
    this.momentum = new MomentumReversalStrategy();
    this.strategies = strategies ?? [
      new SpreadArbitrageStrategy(),
      new LiquidityFadeStrategy(),
      this.momentum,
      new NewsCalibrationStrategy()
    ];
  }

  observeTrade(trade: Trade): void {
    this.momentum.observeTrade(trade);
  }

  async analyze(market: Market, book: OrderBook, topN = 5): Promise<Signal[]> {
    const results = await Promise.allSettled(this.strategies.map((strategy) => strategy.analyze(market, book)));
    const signals = results.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
    return dedupeSignals(signals)
      .filter((signal) => signal.edge >= config.MIN_EDGE_THRESHOLD)
      .sort((a, b) => b.edge * b.confidence - a.edge * a.confidence)
      .slice(0, topN);
  }
}

export function dedupeSignals(signals: Signal[]): Signal[] {
  const best = new Map<string, Signal>();
  for (const signal of signals) {
    const existing = best.get(signal.conditionId);
    if (!existing || signal.edge * signal.confidence > existing.edge * existing.confidence) {
      best.set(signal.conditionId, signal);
    }
  }
  return [...best.values()];
}

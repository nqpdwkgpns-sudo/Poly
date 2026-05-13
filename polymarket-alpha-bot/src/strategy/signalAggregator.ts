import { Market, OrderBook } from '../market/types.js';
import { Strategy, Signal } from './types.js';
import { config } from '../config/env.js';
import { child } from '../monitoring/logger.js';
import { SpreadArbitrageStrategy } from './strategies/spreadArbitrage.js';
import { LiquidityFadeStrategy } from './strategies/liquidityFade.js';
import { momentumReversal } from './strategies/momentumReversal.js';
import { NewsCalibrationStrategy } from './strategies/newsCalibration.js';

const log = child('signalAggregator');

export class SignalAggregator {
  private readonly strategies: Strategy[];
  /** Ring buffer of every signal considered (for the dashboard feed). */
  private readonly history: Array<Signal & { approved?: boolean; reason?: string }> = [];
  private static readonly HISTORY_MAX = 100;

  constructor(strategies?: Strategy[]) {
    this.strategies = strategies ?? [
      new SpreadArbitrageStrategy(),
      new LiquidityFadeStrategy(),
      momentumReversal,
      new NewsCalibrationStrategy(),
    ];
  }

  getStrategies(): Strategy[] {
    return this.strategies;
  }

  getRecent(limit = 50): Array<Signal & { approved?: boolean; reason?: string }> {
    return this.history.slice(-limit).reverse();
  }

  recordOutcome(signal: Signal, approved: boolean, reason?: string): void {
    this.history.push({ ...signal, approved, reason });
    while (this.history.length > SignalAggregator.HISTORY_MAX) this.history.shift();
  }

  /**
   * Run all strategies in parallel on a single (market, book) snapshot.
   * Deduplicates by conditionId by keeping the highest edge*confidence signal.
   */
  async analyzeMarket(market: Market, book: OrderBook): Promise<Signal | null> {
    const results = await Promise.allSettled(
      this.strategies.map((s) => s.analyze(market, book)),
    );
    const signals: Signal[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) signals.push(r.value);
      else if (r.status === 'rejected') log.debug({ err: (r.reason as Error).message }, 'strategy error');
    }
    if (signals.length === 0) return null;
    signals.sort((a, b) => b.edge * b.confidence - a.edge * a.confidence);
    return signals[0];
  }

  /** Filter & rank a batch of analyzed signals. */
  rank(signals: Signal[], topN = 10): Signal[] {
    const minEdge = config.MIN_EDGE_THRESHOLD ?? 0.03;
    const dedup = new Map<string, Signal>();
    for (const s of signals) {
      const key = s.conditionId;
      const existing = dedup.get(key);
      if (!existing || s.edge * s.confidence > existing.edge * existing.confidence) {
        dedup.set(key, s);
      }
    }
    const ranked = [...dedup.values()]
      .filter((s) => s.edge >= minEdge)
      .sort((a, b) => b.edge * b.confidence - a.edge * a.confidence);
    return ranked.slice(0, topN);
  }
}

export const signalAggregator = new SignalAggregator();

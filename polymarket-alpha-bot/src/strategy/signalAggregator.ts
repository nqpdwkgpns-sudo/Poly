import { config } from "../config/env.js";
import type { Market, OrderBook } from "../market/types.js";
import { logger } from "../monitoring/logger.js";
import type { Signal, Strategy } from "./types.js";

export class SignalAggregator {
  constructor(private readonly strategies: Strategy[]) {}

  public async analyze(market: Market, book: OrderBook, topN = 5): Promise<Signal[]> {
    const evaluated = await Promise.all(
      this.strategies.map(async (strategy) => {
        const signal = await strategy.analyze(market, book);
        if (!signal) {
          return null;
        }
        logger.info({ signal, strategy: strategy.name }, "signal generated");
        return signal;
      })
    );

    const deduped = new Map<string, Signal>();
    evaluated
      .filter((signal): signal is Signal => Boolean(signal))
      .forEach((signal) => {
        const existing = deduped.get(signal.conditionId);
        const score = signal.edge * signal.confidence;
        const currentScore = existing ? existing.edge * existing.confidence : -1;
        if (score > currentScore) {
          deduped.set(signal.conditionId, signal);
        }
      });

    return [...deduped.values()]
      .filter((signal) => signal.edge >= config.MIN_EDGE_THRESHOLD)
      .sort((a, b) => b.edge * b.confidence - a.edge * a.confidence)
      .slice(0, topN);
  }
}

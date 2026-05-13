import { Market, OrderBook } from '../market/types';
import { Signal, Strategy } from './types';
import { config } from '../config/env';
import { spreadArbitrageStrategy } from './strategies/spreadArbitrage';
import { liquidityFadeStrategy } from './strategies/liquidityFade';
import { momentumReversalStrategy } from './strategies/momentumReversal';
import { newsCalibrationStrategy } from './strategies/newsCalibration';
import { logger } from '../monitoring/logger';

const ALL_STRATEGIES: Strategy[] = [
  spreadArbitrageStrategy,
  liquidityFadeStrategy,
  momentumReversalStrategy,
  newsCalibrationStrategy,
];

export interface AggregatedSignal extends Signal {
  rank: number;
  score: number; // edge * confidence
}

export async function analyzeMarket(
  market: Market,
  book: OrderBook
): Promise<Signal[]> {
  const signals = await Promise.allSettled(
    ALL_STRATEGIES.map((s) => s.analyze(market, book))
  );

  const valid: Signal[] = [];
  for (const result of signals) {
    if (result.status === 'fulfilled' && result.value !== null) {
      valid.push(result.value);
    } else if (result.status === 'rejected') {
      logger.debug({ err: result.reason }, 'Strategy threw error');
    }
  }

  return valid;
}

export async function aggregateSignals(
  markets: Market[],
  getBook: (tokenId: string) => Promise<OrderBook>
): Promise<AggregatedSignal[]> {
  const allSignals: Signal[] = [];

  const marketAnalyses = markets.map(async (market) => {
    if (!market.outcomes[0]) return;

    try {
      const book = await getBook(market.outcomes[0].tokenId);
      const signals = await analyzeMarket(market, book);

      for (const signal of signals) {
        logger.debug(
          {
            conditionId: signal.conditionId,
            strategy: signal.strategyName,
            edge: signal.edge,
            confidence: signal.confidence,
          },
          'Signal considered'
        );
        allSignals.push(signal);
      }
    } catch (err) {
      logger.error({ err, conditionId: market.conditionId }, 'Error analyzing market');
    }
  });

  await Promise.allSettled(marketAnalyses);

  // Deduplicate: keep the best signal per conditionId
  const bestByMarket = new Map<string, Signal>();
  for (const signal of allSignals) {
    const existing = bestByMarket.get(signal.conditionId);
    const score = signal.edge * signal.confidence;
    const existingScore = existing ? existing.edge * existing.confidence : -1;
    if (score > existingScore) {
      bestByMarket.set(signal.conditionId, signal);
    }
  }

  // Filter below threshold
  const filtered = Array.from(bestByMarket.values()).filter(
    (s) => s.edge >= config.MIN_EDGE_THRESHOLD
  );

  // Rank by edge * confidence descending
  const ranked: AggregatedSignal[] = filtered
    .map((s, i) => ({ ...s, rank: i, score: s.edge * s.confidence }))
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  logger.info(
    { totalSignals: allSignals.length, afterDedup: bestByMarket.size, afterFilter: ranked.length },
    'Signal aggregation complete'
  );

  return ranked;
}

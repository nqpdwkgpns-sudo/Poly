import axios from 'axios';
import { Market, OrderBook } from '../../market/types.js';
import { Strategy, Signal } from '../types.js';
import { STRATEGY_NAMES } from '../../config/constants.js';
import { config } from '../../config/env.js';
import { midPrice, historicalBaseRate, calibrate } from '../probabilityEngine.js';
import { child } from '../../monitoring/logger.js';

const log = child(`strategy.${STRATEGY_NAMES.NEWS_CALIBRATION}`);

interface MetaculusQuestion {
  community_prediction?: { full?: { q2?: number } };
  title?: string;
}

const MIN_DIVERGENCE = 0.05;

export class NewsCalibrationStrategy implements Strategy {
  name = STRATEGY_NAMES.NEWS_CALIBRATION;

  /** simple in-memory cache so we don't hammer the Metaculus API */
  private readonly cache = new Map<string, { p: number; ts: number }>();
  private readonly cacheMs = 15 * 60 * 1000;

  async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const marketP = midPrice(book);
    const ours = await this.estimateProbability(market);
    if (ours === null) return null;

    const calibrated = calibrate(ours, 0.6);
    const edge = calibrated - marketP;
    if (Math.abs(edge) < MIN_DIVERGENCE) return null;

    const side: Signal['side'] = edge > 0 ? 'BUY' : 'SELL';
    return {
      conditionId: market.conditionId,
      tokenId: book.tokenId,
      side,
      impliedProbability: calibrated,
      marketProbability: marketP,
      edge: Math.abs(edge),
      confidence: Math.min(0.7, Math.abs(edge) / 0.1),
      sizing: 75,
      strategy: this.name,
      price: side === 'BUY' ? Math.min(0.99, marketP + 0.01) : Math.max(0.01, marketP - 0.01),
      rationale: `our prior ${(calibrated * 100).toFixed(0)}% vs market ${(marketP * 100).toFixed(0)}%`,
      ts: Date.now(),
    };
  }

  /** Try Metaculus first, fall back to a keyword/category prior. */
  private async estimateProbability(market: Market): Promise<number | null> {
    const cached = this.cache.get(market.conditionId);
    if (cached && Date.now() - cached.ts < this.cacheMs) return cached.p;

    let p: number | null = null;
    try {
      const url = `${config.METACULUS_API_URL}/questions/?search=${encodeURIComponent(market.question)}&limit=1`;
      const { data } = await axios.get<{ results: MetaculusQuestion[] }>(url, { timeout: 6000 });
      const q2 = data.results?.[0]?.community_prediction?.full?.q2;
      if (typeof q2 === 'number') p = q2;
    } catch (err) {
      log.debug({ err: (err as Error).message }, 'metaculus lookup failed');
    }

    if (p === null) p = historicalBaseRate(market.category, market.question);
    this.cache.set(market.conditionId, { p, ts: Date.now() });
    return p;
  }
}

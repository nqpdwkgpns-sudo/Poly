import axios from 'axios';
import type { Market, OrderBook } from '../../market/types.js';
import { calibrate, historicalBaseRate, marketImpliedProb } from '../probabilityEngine.js';
import type { Signal, Strategy } from '../types.js';

export class NewsCalibrationStrategy implements Strategy {
  readonly name = 'news_calibration';

  async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const marketProb = marketImpliedProb(book);
    if (marketProb === null) return null;
    const externalProb = await this.fetchExternalForecast(market.question).catch(() => null);
    const prior = externalProb ?? historicalBaseRate(market.category, market.question);
    const implied = calibrate(prior, externalProb === null ? 0.35 : 0.65);
    const edge = implied - marketProb;
    if (Math.abs(edge) <= 0.05) return null;
    return {
      conditionId: market.conditionId,
      tokenId: book.tokenId,
      marketQuestion: market.question,
      category: market.category,
      strategy: this.name,
      side: edge > 0 ? 'BUY' : 'SELL',
      impliedProbability: implied,
      marketProbability: marketProb,
      edge: Math.abs(edge),
      confidence: externalProb === null ? 0.35 : 0.6,
      sizing: 100,
      reason: externalProb === null ? 'keyword prior diverges from market' : 'external forecast diverges from market'
    };
  }

  private async fetchExternalForecast(question: string): Promise<number | null> {
    const response = await axios.get('https://www.metaculus.com/api2/questions/', {
      timeout: 5_000,
      params: { search: question, limit: 1 }
    });
    const results = (response.data as { results?: Array<{ community_prediction?: { full?: { q2?: number } } }> }).results ?? [];
    const forecast = results[0]?.community_prediction?.full?.q2;
    return typeof forecast === 'number' ? forecast : null;
  }
}

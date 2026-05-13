import type { Market, OrderBook } from '../../market/types.js';
import { marketImpliedProb } from '../probabilityEngine.js';
import type { Signal, Strategy } from '../types.js';

export class SpreadArbitrageStrategy implements Strategy {
  readonly name = 'spread_arbitrage';

  async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const yesPrice = marketImpliedProb(book);
    const noOutcome = market.outcomes.find((outcome) => outcome.tokenId !== book.tokenId);
    const noPrice = noOutcome?.price;
    if (yesPrice === null || noPrice === undefined) return null;
    const combined = yesPrice + noPrice;
    const arbSpread = 1 - combined;
    if (arbSpread <= 0.03) return null;
    return {
      conditionId: market.conditionId,
      tokenId: book.tokenId,
      marketQuestion: market.question,
      category: market.category,
      strategy: this.name,
      side: 'BUY',
      impliedProbability: Math.min(0.99, yesPrice + arbSpread / 2),
      marketProbability: yesPrice,
      edge: arbSpread,
      confidence: 0.75,
      sizing: Math.min(250, market.liquidity * 0.02),
      reason: `YES + NO prices sum to ${combined.toFixed(4)}`
    };
  }
}

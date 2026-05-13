import type { Market, OrderBook } from '../../market/types.js';
import { marketImpliedProb, midPrice } from '../probabilityEngine.js';
import type { Signal, Strategy } from '../types.js';

export class LiquidityFadeStrategy implements Strategy {
  readonly name = 'liquidity_fade';

  async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const bestBid = book.bids[0];
    const bestAsk = book.asks[0];
    const mid = midPrice(book);
    const marketProb = marketImpliedProb(book);
    if (!bestBid || !bestAsk || mid === null || marketProb === null) return null;
    const spread = bestAsk.price - bestBid.price;
    const topDepth = Math.min(bestBid.price * bestBid.size, bestAsk.price * bestAsk.size);
    if (spread < 0.06 || topDepth > 2_000) return null;
    const side = mid >= 0.5 ? 'SELL' : 'BUY';
    const edge = Math.min(0.12, spread / 2);
    return {
      conditionId: market.conditionId,
      tokenId: book.tokenId,
      marketQuestion: market.question,
      category: market.category,
      strategy: this.name,
      side,
      impliedProbability: side === 'BUY' ? marketProb + edge : marketProb - edge,
      marketProbability: marketProb,
      edge,
      confidence: topDepth < 500 ? 0.55 : 0.4,
      sizing: Math.max(10, Math.min(150, topDepth * 0.25)),
      reason: `wide spread ${(spread * 100).toFixed(2)}% with top depth ${topDepth.toFixed(2)} USDC`
    };
  }
}

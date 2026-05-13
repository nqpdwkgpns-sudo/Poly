import type { Market, OrderBook, Trade } from '../../market/types.js';
import { marketImpliedProb } from '../probabilityEngine.js';
import type { Signal, Strategy } from '../types.js';

export class MomentumReversalStrategy implements Strategy {
  readonly name = 'momentum_reversal';
  private readonly trades = new Map<string, Trade[]>();

  observeTrade(trade: Trade): void {
    const rows = this.trades.get(trade.tokenId) ?? [];
    rows.push(trade);
    this.trades.set(trade.tokenId, rows.slice(-30));
  }

  async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const rows = this.trades.get(book.tokenId) ?? [];
    const recent = rows.filter((trade) => Date.now() - trade.timestamp <= 10 * 60_000).slice(-30);
    if (recent.length < 5) return null;
    const first = recent[0];
    const last = recent[recent.length - 1];
    if (!first || !last || first.price <= 0) return null;
    const move = (last.price - first.price) / first.price;
    if (Math.abs(move) < 0.08) return null;
    const marketProb = marketImpliedProb(book) ?? last.price;
    const side = move > 0 ? 'SELL' : 'BUY';
    const edge = Math.min(0.1, Math.abs(move) / 2);
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
      confidence: Math.min(0.5, 0.25 + Math.abs(move)),
      sizing: 75,
      reason: `fading ${(move * 100).toFixed(2)}% move over ${recent.length} trades`
    };
  }
}

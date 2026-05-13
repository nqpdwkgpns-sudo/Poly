import type { Market, OrderBook, Trade } from "../../market/types.js";
import { marketImpliedProb } from "../probabilityEngine.js";
import type { Signal, Strategy } from "../types.js";

export class MomentumReversalStrategy implements Strategy {
  public readonly name = "momentum-reversal";
  private readonly tradeHistory = new Map<string, Trade[]>();

  public ingestTrade(trade: Trade): void {
    const bucket = this.tradeHistory.get(trade.tokenId) ?? [];
    bucket.push(trade);
    const cutoff = Date.now() - 10 * 60_000;
    const clipped = bucket.filter((entry) => entry.timestamp >= cutoff).slice(-30);
    this.tradeHistory.set(trade.tokenId, clipped);
  }

  public async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const tokenId = market.tokenIds[0] ?? "";
    const history = this.tradeHistory.get(tokenId) ?? [];
    if (history.length < 5) {
      return null;
    }

    const first = history[0]?.price ?? 0;
    const last = history[history.length - 1]?.price ?? first;
    if (first <= 0) {
      return null;
    }
    const move = (last - first) / first;
    if (Math.abs(move) < 0.08) {
      return null;
    }

    const marketProbability = marketImpliedProb(book);
    return {
      conditionId: market.conditionId,
      tokenId,
      side: move > 0 ? "SELL" : "BUY",
      impliedProbability: Math.min(0.99, Math.max(0.01, marketProbability - move * 0.6)),
      marketProbability,
      edge: Math.abs(move) * 0.3,
      confidence: 0.5,
      sizing: 40,
      strategy: this.name,
      reason: `10m move ${(move * 100).toFixed(2)}%`
    };
  }
}

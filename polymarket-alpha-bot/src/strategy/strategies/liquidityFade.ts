import type { Market, OrderBook } from "../../market/types.js";
import { midPrice } from "../probabilityEngine.js";
import type { Signal, Strategy } from "../types.js";

export class LiquidityFadeStrategy implements Strategy {
  public readonly name = "liquidity-fade";

  public async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const topBid = book.bids[0];
    const topAsk = book.asks[0];
    if (!topBid || !topAsk) {
      return null;
    }

    const spread = topAsk.price - topBid.price;
    const depth = topBid.size * topBid.price + topAsk.size * topAsk.price;
    if (spread < 0.05 || depth > 3_000) {
      return null;
    }

    const mid = midPrice(book);
    return {
      conditionId: market.conditionId,
      tokenId: market.tokenIds[0] ?? "",
      side: "BUY",
      impliedProbability: mid,
      marketProbability: mid + spread / 4,
      edge: spread / 2,
      confidence: 0.62,
      sizing: Math.min(125, depth * 0.05),
      strategy: this.name,
      reason: `thin depth=${depth.toFixed(2)} spread=${spread.toFixed(3)}`
    };
  }
}

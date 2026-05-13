import type { Market, OrderBook } from "../../market/types.js";
import type { Signal, Strategy } from "../types.js";

export class SpreadArbitrageStrategy implements Strategy {
  public readonly name = "spread-arbitrage";

  public async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const yesAsk = book.asks[0]?.price;
    const noAsk = book.asks[1]?.price;
    if (yesAsk === undefined || noAsk === undefined) {
      return null;
    }

    const combined = yesAsk + noAsk;
    const spread = 1 - combined;
    if (combined >= 0.97 || spread <= 0.03) {
      return null;
    }

    return {
      conditionId: market.conditionId,
      tokenId: market.tokenIds[0] ?? "",
      side: "BUY",
      impliedProbability: 0.5,
      marketProbability: combined / 2,
      edge: spread,
      confidence: 0.75,
      sizing: 50,
      strategy: this.name,
      reason: `YES+NO=${combined.toFixed(3)}`
    };
  }
}

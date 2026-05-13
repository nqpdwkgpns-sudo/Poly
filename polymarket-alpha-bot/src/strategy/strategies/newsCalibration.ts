import { logger } from "../../monitoring/logger.js";
import type { Market, OrderBook } from "../../market/types.js";
import { calibrate, historicalBaseRate, marketImpliedProb } from "../probabilityEngine.js";
import type { Signal, Strategy } from "../types.js";

interface MetaculusQuestion {
  community_prediction?: {
    full?: {
      q2?: number;
    };
  };
}

interface MetaculusResponse {
  results?: MetaculusQuestion[];
}

export class NewsCalibrationStrategy implements Strategy {
  public readonly name = "news-calibration";

  public async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const marketProbability = marketImpliedProb(book);
    const external = await this.fetchMetaculusProbability(market.question);
    const fallback = calibrate(historicalBaseRate(market.category, market.question), 0.45);
    const implied = external ?? fallback;
    const edge = implied - marketProbability;
    if (Math.abs(edge) < 0.05) {
      return null;
    }

    return {
      conditionId: market.conditionId,
      tokenId: market.tokenIds[0] ?? "",
      side: edge > 0 ? "BUY" : "SELL",
      impliedProbability: implied,
      marketProbability,
      edge: Math.abs(edge),
      confidence: external ? 0.68 : 0.4,
      sizing: 80,
      strategy: this.name,
      reason: external ? "metaculus divergence" : "keyword fallback prior"
    };
  }

  private async fetchMetaculusProbability(query: string): Promise<number | null> {
    try {
      const url = `https://www.metaculus.com/api2/questions/?search=${encodeURIComponent(query)}&limit=1`;
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as MetaculusResponse;
      const q2 = payload.results?.[0]?.community_prediction?.full?.q2;
      if (typeof q2 !== "number") {
        return null;
      }
      return q2 / 100;
    } catch (error) {
      logger.warn({ err: error, query }, "metaculus fetch failed");
      return null;
    }
  }
}

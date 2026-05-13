import pLimit from "p-limit";
import { config } from "../config/env.js";
import { logger } from "../monitoring/logger.js";
import type { Market, MarketOutcome } from "./types.js";
import { buildHttpClient } from "./http.js";

interface GammaMarket {
  conditionId?: string;
  questionID?: string;
  id?: string;
  slug?: string;
  question?: string;
  description?: string;
  category?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  volume24hr?: number;
  liquidityNum?: number;
  outcomes?: string[];
  clobTokenIds?: string[];
}

const RATE_LIMIT = pLimit(10);

export class GammaClient {
  private readonly client = buildHttpClient(config.POLYMARKET_GAMMA_URL);

  public async fetchActiveMarkets(filters?: Record<string, string | number | boolean>): Promise<Market[]> {
    const limit = 100;
    let offset = 0;
    const all: Market[] = [];

    while (true) {
      const response = await RATE_LIMIT(() =>
        this.client.get<GammaMarket[]>("/markets", {
          params: {
            active: true,
            closed: false,
            limit,
            offset,
            ...filters
          }
        })
      ).catch((error: unknown) => {
        logger.error({ err: error, offset }, "gamma fetchActiveMarkets failed");
        throw new Error(`Gamma API fetchActiveMarkets failed at offset ${offset}`);
      });

      const parsed = response.data.map((m) => this.toMarket(m)).filter(Boolean) as Market[];
      all.push(...parsed);

      if (response.data.length < limit) {
        break;
      }
      offset += limit;
    }

    return all;
  }

  public async fetchMarketById(conditionId: string): Promise<Market | null> {
    const response = await RATE_LIMIT(() =>
      this.client.get<GammaMarket[]>("/markets", { params: { conditionId, limit: 1 } })
    ).catch((error: unknown) => {
      logger.error({ err: error, conditionId }, "gamma fetchMarketById failed");
      throw new Error(`Gamma API fetchMarketById failed for conditionId ${conditionId}`);
    });

    const raw = response.data[0];
    return raw ? this.toMarket(raw) : null;
  }

  public async searchMarkets(query: string): Promise<Market[]> {
    const response = await RATE_LIMIT(() =>
      this.client.get<GammaMarket[]>("/markets", { params: { limit: 50, query } })
    ).catch((error: unknown) => {
      logger.error({ err: error, query }, "gamma searchMarkets failed");
      throw new Error(`Gamma API searchMarkets failed for query "${query}"`);
    });

    return response.data.map((m) => this.toMarket(m)).filter(Boolean) as Market[];
  }

  private toMarket(raw: GammaMarket): Market | null {
    const conditionId = raw.conditionId ?? raw.questionID ?? raw.id;
    const tokenIds = raw.clobTokenIds ?? [];
    const question = raw.question?.trim() ?? "";
    if (!conditionId || !tokenIds.length || !question) {
      return null;
    }

    const outcomes: MarketOutcome[] = (raw.outcomes ?? []).map((outcome, index) => ({
      outcome,
      tokenId: tokenIds[index] ?? tokenIds[0]
    }));

    return {
      conditionId,
      slug: raw.slug,
      question,
      description: raw.description,
      category: raw.category ?? "uncategorized",
      endDate: raw.endDate ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      active: raw.active ?? true,
      closed: raw.closed ?? false,
      archived: raw.archived ?? false,
      volume24h: Number(raw.volume24hr ?? 0),
      liquidityNum: Number(raw.liquidityNum ?? 0),
      outcomes,
      tokenIds
    };
  }
}

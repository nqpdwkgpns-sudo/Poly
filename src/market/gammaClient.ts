import axios, { type AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import pLimit from 'p-limit';
import { config } from '../config/env.js';
import type { Market, MarketOutcome } from './types.js';

export interface MarketFilters {
  category?: string;
  limit?: number;
  offset?: number;
}

interface GammaMarketResponse {
  id?: string | number;
  conditionId?: string;
  question?: string;
  slug?: string;
  category?: string;
  endDate?: string;
  end_date_iso?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  resolved?: boolean;
  volume24hr?: string | number;
  volume24h?: string | number;
  volume?: string | number;
  liquidity?: string | number;
  outcomes?: string[] | string;
  outcomePrices?: string[] | string;
  clobTokenIds?: string[] | string;
}

export class GammaClient {
  private readonly http: AxiosInstance;
  private readonly limit = pLimit(10);

  constructor(baseURL = config.POLYMARKET_GAMMA_URL) {
    this.http = axios.create({ baseURL, timeout: 10_000 });
    axiosRetry(this.http, { retries: 3, retryDelay: axiosRetry.exponentialDelay });
  }

  async fetchActiveMarkets(filters: MarketFilters = {}): Promise<Market[]> {
    const pageSize = filters.limit ?? 100;
    const markets: Market[] = [];
    let offset = filters.offset ?? 0;

    while (true) {
      const batch = await this.request<GammaMarketResponse[]>('/markets', {
        active: true,
        closed: false,
        limit: pageSize,
        offset,
        category: filters.category
      });
      markets.push(...batch.map(normalizeGammaMarket));
      if (batch.length < pageSize || filters.limit) break;
      offset += pageSize;
    }

    return markets.filter((market) => market.active && !market.closed && !market.resolved);
  }

  async fetchMarketById(conditionId: string): Promise<Market> {
    const markets = await this.request<GammaMarketResponse[]>('/markets', { condition_ids: conditionId, limit: 1 });
    const market = markets[0];
    if (!market) throw new Error(`Gamma market not found for conditionId=${conditionId}`);
    return normalizeGammaMarket(market);
  }

  async searchMarkets(query: string): Promise<Market[]> {
    const results = await this.request<GammaMarketResponse[]>('/markets', { q: query, active: true, closed: false, limit: 50 });
    return results.map(normalizeGammaMarket);
  }

  private async request<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.limit(async () => {
      try {
        const response = await this.http.get<T>(path, { params });
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          throw new Error(`Gamma API ${path} failed: ${error.response?.status ?? 'network'} ${error.message}`);
        }
        throw error;
      }
    });
  }
}

export function normalizeGammaMarket(raw: GammaMarketResponse): Market {
  const tokenIds = parseArray(raw.clobTokenIds);
  const outcomeNames = parseArray(raw.outcomes);
  const outcomePrices = parseArray(raw.outcomePrices).map(Number);
  const outcomes: MarketOutcome[] = outcomeNames.map((name, index) => ({
    name,
    tokenId: tokenIds[index] ?? '',
    price: Number.isFinite(outcomePrices[index]) ? outcomePrices[index] : undefined
  }));

  return {
    id: String(raw.id ?? raw.conditionId ?? ''),
    conditionId: String(raw.conditionId ?? raw.id ?? ''),
    question: raw.question ?? '',
    slug: raw.slug,
    category: raw.category ?? 'uncategorized',
    endDate: raw.endDate ?? raw.end_date_iso ?? new Date(0).toISOString(),
    active: raw.active ?? false,
    closed: raw.closed ?? false,
    resolved: raw.resolved ?? raw.archived ?? false,
    volume24h: toNumber(raw.volume24hr ?? raw.volume24h ?? raw.volume),
    liquidity: toNumber(raw.liquidity),
    outcomes,
    tokenIds
  };
}

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(',').map((part) => part.trim()).filter(Boolean);
  }
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import pLimit from 'p-limit';
import { config } from '../config/env';
import { Market, GammaMarketResponse, MarketCategory } from './types';

const RATE_LIMIT = 10; // max 10 req/s
const limit = pLimit(RATE_LIMIT);

function createGammaAxios(): AxiosInstance {
  const instance = axios.create({
    baseURL: config.POLYMARKET_GAMMA_URL,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
  });

  axiosRetry(instance, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
      axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      (error.response?.status !== undefined && error.response.status >= 500),
  });

  return instance;
}

const gammaAxios = createGammaAxios();

function mapGammaMarket(raw: GammaMarketResponse): Market {
  return {
    conditionId: raw.condition_id,
    questionId: raw.question_id,
    slug: raw.slug,
    question: raw.title,
    description: raw.description ?? '',
    category: raw.category ?? 'other',
    subcategory: raw.sub_category ?? '',
    outcomes: (raw.tokens ?? []).map((t) => ({
      tokenId: t.token_id,
      outcome: t.outcome,
      price: t.price,
    })),
    endDate: raw.end_date_iso,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    volume: raw.volume ?? 0,
    volume24h: raw.volume_24hr ?? 0,
    liquidity: raw.liquidity ?? 0,
    active: raw.active,
    closed: raw.closed,
    archived: raw.archived,
    resolved: raw.resolved,
    resolutionSource: raw.resolution_source ?? '',
    tags: raw.tags ?? [],
  };
}

export interface MarketFilters {
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  category?: string;
  limit?: number;
  offset?: number;
}

export async function fetchActiveMarkets(filters: MarketFilters = {}): Promise<Market[]> {
  const params: Record<string, string | number | boolean> = {
    active: filters.active ?? true,
    closed: filters.closed ?? false,
    archived: filters.archived ?? false,
    limit: filters.limit ?? 100,
    offset: filters.offset ?? 0,
  };

  if (filters.category) params.category = filters.category;

  const markets: Market[] = [];
  let offset = filters.offset ?? 0;
  const pageSize = 100;

  while (true) {
    params.offset = offset;

    const response = await limit(() =>
      gammaAxios.get<GammaMarketResponse[]>('/markets', { params })
    );

    const page = response.data;
    if (!Array.isArray(page) || page.length === 0) break;

    markets.push(...page.map(mapGammaMarket));

    if (page.length < pageSize || (filters.limit && markets.length >= filters.limit)) break;

    offset += pageSize;
  }

  return filters.limit ? markets.slice(0, filters.limit) : markets;
}

export async function fetchMarketById(conditionId: string): Promise<Market> {
  const response = await limit(() =>
    gammaAxios.get<GammaMarketResponse>(`/markets/${conditionId}`)
  );
  return mapGammaMarket(response.data);
}

export async function searchMarkets(query: string): Promise<Market[]> {
  const response = await limit(() =>
    gammaAxios.get<GammaMarketResponse[]>('/markets', {
      params: { _q: query, active: true, closed: false, limit: 50 },
    })
  );
  return (response.data ?? []).map(mapGammaMarket);
}

export async function fetchMarketsByCategory(category: MarketCategory): Promise<Market[]> {
  return fetchActiveMarkets({ category });
}

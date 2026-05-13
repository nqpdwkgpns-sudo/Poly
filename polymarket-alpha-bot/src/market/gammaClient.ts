import pLimit from 'p-limit';
import { AxiosInstance } from 'axios';
import { config } from '../config/env.js';
import { child } from '../monitoring/logger.js';
import { createHttpClient } from './http.js';
import { Market, MarketCategory, MarketOutcome } from './types.js';

const log = child('gamma');

export interface MarketFilters {
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  limit?: number;
  offset?: number;
  category?: string;
  order?: string;
  ascending?: boolean;
}

interface GammaMarketRaw {
  id: number | string;
  conditionId?: string;
  questionID?: string;
  question: string;
  description?: string;
  category?: string;
  endDate?: string;
  end_date_iso?: string;
  acceptingOrders?: boolean;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  resolved?: boolean;
  volume?: number | string;
  volumeNum?: number;
  volume24hr?: number | string;
  liquidity?: number | string;
  liquidityNum?: number;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  clobTokenIds?: string | string[];
  tokens?: { token_id: string; outcome: string; price?: number }[];
}

function toArray<T>(v: string | T[] | undefined): T[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function toNum(v: unknown, def = 0): number {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function normalizeCategory(raw?: string): MarketCategory {
  if (!raw) return 'other';
  const s = raw.toLowerCase();
  if (s.includes('polit') || s.includes('election')) return 'politics';
  if (s.includes('crypto') || s.includes('bitcoin') || s.includes('eth')) return 'crypto';
  if (s.includes('sport') || s.includes('nfl') || s.includes('nba') || s.includes('soccer'))
    return 'sports';
  if (s.includes('econ') || s.includes('fed') || s.includes('rate')) return 'economics';
  if (s.includes('cultur') || s.includes('entertain')) return 'culture';
  if (s.includes('scien') || s.includes('tech') || s.includes('ai')) return 'science';
  return 'other';
}

export function normalizeMarket(raw: GammaMarketRaw): Market | null {
  const conditionId = raw.conditionId ?? raw.questionID;
  if (!conditionId) return null;

  const outcomeNames = toArray<string>(raw.outcomes);
  const outcomePrices = toArray<string>(raw.outcomePrices).map((p) => toNum(p));
  const tokenIds = toArray<string>(raw.clobTokenIds);

  let outcomes: MarketOutcome[] = [];
  if (raw.tokens && raw.tokens.length > 0) {
    outcomes = raw.tokens.map((t) => ({
      tokenId: t.token_id,
      name: t.outcome,
      price: toNum(t.price),
    }));
  } else if (tokenIds.length > 0) {
    outcomes = tokenIds.map((tid, i) => ({
      tokenId: tid,
      name: outcomeNames[i] ?? `outcome_${i}`,
      price: outcomePrices[i] ?? 0,
    }));
  }

  const yes = outcomes.find((o) => o.name.toLowerCase() === 'yes');
  const no = outcomes.find((o) => o.name.toLowerCase() === 'no');

  return {
    conditionId,
    id: String(raw.id),
    question: raw.question,
    description: raw.description,
    category: normalizeCategory(raw.category),
    endDate: raw.endDate ?? raw.end_date_iso ?? new Date(0).toISOString(),
    resolved: Boolean(raw.resolved) || Boolean(raw.closed),
    active: raw.active !== false,
    closed: Boolean(raw.closed),
    volume: toNum(raw.volumeNum ?? raw.volume),
    volume24h: toNum(raw.volume24hr),
    liquidity: toNum(raw.liquidityNum ?? raw.liquidity),
    outcomes,
    yesTokenId: yes?.tokenId,
    noTokenId: no?.tokenId,
    raw,
  };
}

export class GammaClient {
  private readonly http: AxiosInstance;
  private readonly limit = pLimit(10);

  constructor(baseUrl: string = config.POLYMARKET_GAMMA_URL) {
    this.http = createHttpClient(baseUrl);
  }

  private gated<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(fn);
  }

  /** Paginated fetch of all active markets, normalized. */
  async fetchActiveMarkets(filters: MarketFilters = {}): Promise<Market[]> {
    const pageSize = filters.limit ?? 100;
    const maxPages = 20;
    const out: Market[] = [];
    let offset = filters.offset ?? 0;

    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, unknown> = {
        limit: pageSize,
        offset,
        active: filters.active ?? true,
        closed: filters.closed ?? false,
        archived: filters.archived ?? false,
        order: filters.order ?? 'volume24hr',
        ascending: filters.ascending ?? false,
      };
      if (filters.category) params.category = filters.category;

      const { data } = await this.gated(() =>
        this.http.get<GammaMarketRaw[] | { data: GammaMarketRaw[] }>('/markets', { params }),
      );
      const arr = Array.isArray(data) ? data : data.data;
      if (!arr || arr.length === 0) break;
      for (const m of arr) {
        const norm = normalizeMarket(m);
        if (norm) out.push(norm);
      }
      if (arr.length < pageSize) break;
      offset += arr.length;
    }
    log.debug({ count: out.length }, 'fetched active markets');
    return out;
  }

  async fetchMarketById(conditionId: string): Promise<Market | null> {
    try {
      const { data } = await this.gated(() =>
        this.http.get<GammaMarketRaw>(`/markets/${conditionId}`),
      );
      return normalizeMarket(data);
    } catch (err) {
      log.warn({ conditionId, err: (err as Error).message }, 'fetchMarketById failed');
      return null;
    }
  }

  async searchMarkets(query: string): Promise<Market[]> {
    const { data } = await this.gated(() =>
      this.http.get<GammaMarketRaw[]>('/markets', {
        params: { search: query, limit: 50, active: true, closed: false },
      }),
    );
    return (data ?? []).map(normalizeMarket).filter((m): m is Market => m !== null);
  }
}

export const gammaClient = new GammaClient();

import { Market, MarketCategory } from './types';
import { MIN_MARKET_VOLUME_24H, MIN_MARKET_EXPIRY_HOURS } from '../config/constants';

const CATEGORY_KEYWORDS: Record<MarketCategory, string[]> = {
  politics: ['election', 'president', 'senate', 'congress', 'vote', 'democrat', 'republican', 'political', 'biden', 'trump'],
  crypto: ['bitcoin', 'ethereum', 'btc', 'eth', 'crypto', 'defi', 'nft', 'blockchain', 'solana', 'polygon'],
  sports: ['nfl', 'nba', 'mlb', 'nhl', 'soccer', 'football', 'basketball', 'baseball', 'tennis', 'golf', 'ufc', 'championship'],
  finance: ['fed', 'interest rate', 'inflation', 'gdp', 'stocks', 'market', 's&p', 'recession', 'ipo'],
  entertainment: ['oscar', 'grammy', 'emmy', 'movie', 'tv show', 'celebrity', 'award', 'music', 'actor'],
  science: ['climate', 'nasa', 'space', 'covid', 'vaccine', 'science', 'research', 'discovery'],
  other: [],
};

export function filterTradeable(markets: Market[]): Market[] {
  const nowMs = Date.now();
  const minExpiryMs = MIN_MARKET_EXPIRY_HOURS * 60 * 60 * 1000;

  return markets.filter((m) => {
    if (m.resolved || m.closed || m.archived) return false;
    if (!m.active) return false;
    if (m.volume24h < MIN_MARKET_VOLUME_24H) return false;

    const endMs = new Date(m.endDate).getTime();
    if (endMs - nowMs < minExpiryMs) return false;

    if (m.outcomes.length < 2) return false;

    return true;
  });
}

export function rankByVolume(markets: Market[]): Market[] {
  return [...markets].sort((a, b) => b.volume24h - a.volume24h);
}

export function groupByCategory(markets: Market[]): Record<MarketCategory, Market[]> {
  const groups: Record<MarketCategory, Market[]> = {
    politics: [],
    crypto: [],
    sports: [],
    finance: [],
    entertainment: [],
    science: [],
    other: [],
  };

  for (const market of markets) {
    const category = detectCategory(market);
    groups[category].push(market);
  }

  return groups;
}

function detectCategory(market: Market): MarketCategory {
  const normalizedCategory = market.category?.toLowerCase() ?? '';
  const text = `${market.question} ${market.description}`.toLowerCase();

  if (normalizedCategory && normalizedCategory !== 'other') {
    for (const [cat] of Object.entries(CATEGORY_KEYWORDS)) {
      if (normalizedCategory.includes(cat)) {
        return cat as MarketCategory;
      }
    }
  }

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [MarketCategory, string[]][]) {
    if (cat === 'other') continue;
    if (keywords.some((kw) => text.includes(kw))) {
      return cat;
    }
  }

  return 'other';
}

export function filterByMinLiquidity(markets: Market[], minLiquidity: number): Market[] {
  return markets.filter((m) => m.liquidity >= minLiquidity);
}

export function getMarketCategory(market: Market): MarketCategory {
  return detectCategory(market);
}

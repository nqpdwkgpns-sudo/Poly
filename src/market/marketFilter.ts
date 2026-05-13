import type { Market } from './types.js';

export function filterTradeable(markets: Market[]): Market[] {
  return markets.filter((market) => {
    const hoursUntilExpiry = (new Date(market.endDate).getTime() - Date.now()) / 3_600_000;
    return market.active
      && !market.closed
      && !market.resolved
      && market.volume24h >= 10_000
      && hoursUntilExpiry >= 24
      && market.outcomes.length === 2
      && market.tokenIds.length >= 2;
  });
}

export function rankByVolume(markets: Market[]): Market[] {
  return [...markets].sort((a, b) => b.volume24h - a.volume24h);
}

export function groupByCategory(markets: Market[]): Record<string, Market[]> {
  return markets.reduce<Record<string, Market[]>>((groups, market) => {
    const category = normalizeCategory(market.category);
    groups[category] = groups[category] ?? [];
    groups[category].push(market);
    return groups;
  }, {});
}

function normalizeCategory(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes('politic') || lower.includes('election')) return 'politics';
  if (lower.includes('crypto') || lower.includes('bitcoin')) return 'crypto';
  if (lower.includes('sport')) return 'sports';
  if (lower.includes('econom')) return 'economics';
  return lower || 'other';
}

import { Market, MarketCategory } from './types.js';

const MIN_VOLUME_USDC = 10_000;
const MIN_HOURS_TO_EXPIRY = 24;

export interface FilterOptions {
  minVolumeUsdc?: number;
  minHoursToExpiry?: number;
  binaryOnly?: boolean;
}

export function filterTradeable(markets: Market[], opts: FilterOptions = {}): Market[] {
  const minVolume = opts.minVolumeUsdc ?? MIN_VOLUME_USDC;
  const minHours = opts.minHoursToExpiry ?? MIN_HOURS_TO_EXPIRY;
  const binaryOnly = opts.binaryOnly ?? true;
  const now = Date.now();

  return markets.filter((m) => {
    if (m.resolved || m.closed || !m.active) return false;
    if ((m.volume24h ?? m.volume) < minVolume) return false;
    const end = Date.parse(m.endDate);
    if (!Number.isFinite(end)) return false;
    const hoursToExpiry = (end - now) / 3_600_000;
    if (hoursToExpiry < minHours) return false;
    if (binaryOnly) {
      if (m.outcomes.length !== 2) return false;
      const hasYes = m.outcomes.some((o) => o.name.toLowerCase() === 'yes');
      const hasNo = m.outcomes.some((o) => o.name.toLowerCase() === 'no');
      if (!hasYes || !hasNo) return false;
    }
    return true;
  });
}

export function rankByVolume(markets: Market[]): Market[] {
  return [...markets].sort((a, b) => (b.volume24h ?? b.volume) - (a.volume24h ?? a.volume));
}

export function groupByCategory(markets: Market[]): Record<MarketCategory, Market[]> {
  const buckets: Record<MarketCategory, Market[]> = {
    politics: [],
    crypto: [],
    sports: [],
    economics: [],
    culture: [],
    science: [],
    other: [],
  };
  for (const m of markets) buckets[m.category].push(m);
  return buckets;
}

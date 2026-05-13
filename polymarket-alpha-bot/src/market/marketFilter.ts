import { DEFAULT_LIMITS } from "../config/constants.js";
import type { Market } from "./types.js";

export const filterTradeable = (markets: Market[]): Market[] => {
  const now = Date.now();
  return markets.filter((market) => {
    if (!market.active || market.closed || market.archived) {
      return false;
    }
    if (market.volume24h < DEFAULT_LIMITS.minVolume24hUsdc) {
      return false;
    }
    const expiry = Number(new Date(market.endDate));
    if (Number.isNaN(expiry) || expiry - now < DEFAULT_LIMITS.minTimeToExpiryMs) {
      return false;
    }
    if (market.tokenIds.length !== 2) {
      return false;
    }
    return true;
  });
};

export const rankByVolume = (markets: Market[]): Market[] =>
  [...markets].sort((a, b) => b.volume24h - a.volume24h);

export const groupByCategory = (markets: Market[]): Record<string, Market[]> =>
  markets.reduce<Record<string, Market[]>>((acc, market) => {
    const category = market.category.toLowerCase();
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(market);
    return acc;
  }, {});

import { Market, OrderBook } from '../../market/types';
import { Signal, Strategy } from '../types';
import { midPrice, bestBidDepthUsdc, bestAskDepthUsdc } from '../probabilityEngine';

const MIN_SPREAD_TO_FADE = 0.06;    // minimum 6% spread to consider
const MAX_SPREAD_TO_FADE = 0.20;    // don't trade extremely illiquid markets
const MAX_BOOK_DEPTH_USDC = 2000;   // only fade thin books
const PULL_THRESHOLD_PCT = 0.02;    // pull orders if market moves >2%

export class LiquidityFadeStrategy implements Strategy {
  name = 'LiquidityFade';

  async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const spread = book.spread;

    if (spread < MIN_SPREAD_TO_FADE) return null;
    if (spread > MAX_SPREAD_TO_FADE) return null;

    const bidDepth = bestBidDepthUsdc(book);
    const askDepth = bestAskDepthUsdc(book);
    const totalDepth = bidDepth + askDepth;

    if (totalDepth > MAX_BOOK_DEPTH_USDC) return null;

    const mid = midPrice(book);

    // Post a limit order at mid-price on the thinner side to earn the spread
    // Prefer buying on thin-ask side (more sellers needed) or selling on thin-bid side
    const buyAskDepthRatio = askDepth / (totalDepth + 0.01);
    const side: 'BUY' | 'SELL' = buyAskDepthRatio < 0.4 ? 'BUY' : 'SELL';
    const tokenId = market.outcomes[0]?.tokenId ?? '';

    if (!tokenId) return null;

    // Edge from spread capture: half spread minus fee
    const spreadEdge = spread / 2 - 0.01;
    if (spreadEdge <= 0) return null;

    return {
      conditionId: market.conditionId,
      tokenId,
      side,
      impliedProbability: side === 'BUY' ? mid + spread / 4 : mid - spread / 4,
      marketProbability: mid,
      edge: spreadEdge,
      confidence: 0.4, // lower confidence for market-making
      sizing: 25,       // small size for liquidity provision
      strategyName: this.name,
      reasoning: `Thin book (depth $${totalDepth.toFixed(0)}), spread ${(spread * 100).toFixed(1)}%, posting at mid`,
    };
  }
}

export const liquidityFadeStrategy = new LiquidityFadeStrategy();

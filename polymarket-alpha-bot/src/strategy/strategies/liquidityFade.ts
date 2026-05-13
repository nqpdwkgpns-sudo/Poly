import { Market, OrderBook } from '../../market/types.js';
import { Strategy, Signal } from '../types.js';
import {
  STRATEGY_NAMES,
  LIQUIDITY_FADE_MOVE_PCT,
} from '../../config/constants.js';
import { midPrice, spread } from '../probabilityEngine.js';
import { child } from '../../monitoring/logger.js';

const log = child(`strategy.${STRATEGY_NAMES.LIQUIDITY_FADE}`);

const MIN_SPREAD = 0.02;
const MIN_DEPTH_USDC = 100;

/**
 * Posts limit orders at mid-price in thin books to earn the spread. Generates
 * a signal only when:
 *  - top spread > 2%
 *  - top-of-book depth is small (otherwise the spread is already arb'd)
 */
export class LiquidityFadeStrategy implements Strategy {
  name = STRATEGY_NAMES.LIQUIDITY_FADE;

  constructor(private moveThreshold: number = LIQUIDITY_FADE_MOVE_PCT) {}

  async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const s = spread(book);
    if (s < MIN_SPREAD) return null;

    const topBid = book.bids[0];
    const topAsk = book.asks[0];
    if (!topBid || !topAsk) return null;
    if (topBid.size > MIN_DEPTH_USDC && topAsk.size > MIN_DEPTH_USDC) return null;

    const mid = midPrice(book);
    const captureEdge = s / 2; // theoretical capture
    const conf = Math.min(0.8, captureEdge / 0.05);
    log.debug(
      { conditionId: market.conditionId, spread: s, mid },
      'liquidity fade signal',
    );

    // Bias direction toward the thinner side (post on the side with less depth).
    const side: Signal['side'] = topBid.size <= topAsk.size ? 'BUY' : 'SELL';
    return {
      conditionId: market.conditionId,
      tokenId: book.tokenId,
      side,
      impliedProbability: mid,
      marketProbability: mid,
      edge: captureEdge,
      confidence: conf,
      sizing: 50,
      strategy: this.name,
      price: side === 'BUY' ? mid - this.moveThreshold / 2 : mid + this.moveThreshold / 2,
      rationale: `thin book spread ${(s * 100).toFixed(1)}%, posting at mid ± half-tick`,
      ts: Date.now(),
    };
  }
}

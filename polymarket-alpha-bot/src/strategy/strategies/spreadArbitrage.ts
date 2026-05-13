import { Market, OrderBook } from '../../market/types.js';
import { clobClient } from '../../market/clobClient.js';
import { Strategy, Signal } from '../types.js';
import {
  STRATEGY_NAMES,
  SPREAD_ARB_THRESHOLD,
} from '../../config/constants.js';
import { midPrice } from '../probabilityEngine.js';
import { child } from '../../monitoring/logger.js';

const log = child(`strategy.${STRATEGY_NAMES.SPREAD_ARB}`);

/**
 * For a binary market, YES_ask + NO_ask should sum to roughly 1 + fees. When
 * the sum drops below `threshold` (default 0.97) we have a cross-book
 * arbitrage: buy both sides and lock in the spread.
 */
export class SpreadArbitrageStrategy implements Strategy {
  name = STRATEGY_NAMES.SPREAD_ARB;

  constructor(private threshold: number = SPREAD_ARB_THRESHOLD) {}

  async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    if (!market.yesTokenId || !market.noTokenId) return null;
    const otherTokenId = book.tokenId === market.yesTokenId ? market.noTokenId : market.yesTokenId;

    let otherAsk: number | undefined;
    try {
      const { ask } = await clobClient.fetchMarketPrice(otherTokenId);
      otherAsk = ask;
    } catch (err) {
      log.debug({ conditionId: market.conditionId, err: (err as Error).message }, 'spread arb fetch failed');
      return null;
    }

    const thisAsk = book.asks[0]?.price;
    if (thisAsk === undefined || otherAsk === undefined) return null;
    const sum = thisAsk + otherAsk;
    if (sum >= this.threshold) return null;

    const edge = this.threshold - sum;
    const conf = Math.min(1, edge / 0.05);
    log.info(
      { conditionId: market.conditionId, sum, edge },
      'spread arbitrage signal',
    );
    return {
      conditionId: market.conditionId,
      tokenId: book.tokenId,
      side: 'BUY',
      impliedProbability: 1 - otherAsk,
      marketProbability: midPrice(book),
      edge,
      confidence: conf,
      sizing: 100, // gets sized later by Kelly
      strategy: this.name,
      price: thisAsk,
      rationale: `YES+NO ask sum ${sum.toFixed(3)} < ${this.threshold} → arb`,
      ts: Date.now(),
    };
  }
}

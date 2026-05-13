import { Market, OrderBook, Trade } from '../../market/types.js';
import { Strategy, Signal } from '../types.js';
import {
  STRATEGY_NAMES,
  MOMENTUM_REVERSAL_MOVE_PCT,
  MOMENTUM_REVERSAL_WINDOW_MS,
} from '../../config/constants.js';
import { midPrice } from '../probabilityEngine.js';
import { child } from '../../monitoring/logger.js';

const log = child(`strategy.${STRATEGY_NAMES.MOMENTUM_REVERSAL}`);

/**
 * Tracks per-token rolling trade history and fades sharp moves (>8% in <10
 * minutes) as overreactions. Counter-trend signals are confidence-capped at
 * 0.5 because mean-reversion strategies in binary markets often run into
 * resolution news.
 */
export class MomentumReversalStrategy implements Strategy {
  name = STRATEGY_NAMES.MOMENTUM_REVERSAL;

  private readonly history = new Map<string, Trade[]>();
  private static readonly MAX_TRADES = 30;

  constructor(
    private moveThreshold: number = MOMENTUM_REVERSAL_MOVE_PCT,
    private windowMs: number = MOMENTUM_REVERSAL_WINDOW_MS,
  ) {}

  /** Public hook: feed live trades from wsClient. */
  recordTrade(trade: Trade): void {
    const arr = this.history.get(trade.tokenId) ?? [];
    arr.push(trade);
    while (arr.length > MomentumReversalStrategy.MAX_TRADES) arr.shift();
    this.history.set(trade.tokenId, arr);
  }

  async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const trades = this.history.get(book.tokenId);
    if (!trades || trades.length < 5) return null;
    const now = Date.now();
    const window = trades.filter((t) => now - t.timestamp <= this.windowMs);
    if (window.length < 5) return null;

    const first = window[0].price;
    const last = window[window.length - 1].price;
    if (first <= 0) return null;
    const move = (last - first) / first;
    if (Math.abs(move) < this.moveThreshold) return null;

    const mid = midPrice(book);
    const side: Signal['side'] = move > 0 ? 'SELL' : 'BUY';
    const edge = Math.abs(move) * 0.4; // expected partial reversion
    const confidence = Math.min(0.5, Math.abs(move) / 0.2);
    log.info(
      { conditionId: market.conditionId, move, side, mid },
      'momentum reversal signal',
    );
    return {
      conditionId: market.conditionId,
      tokenId: book.tokenId,
      side,
      impliedProbability: side === 'BUY' ? mid + edge : mid - edge,
      marketProbability: mid,
      edge,
      confidence,
      sizing: 50,
      strategy: this.name,
      price: mid,
      rationale: `move ${(move * 100).toFixed(1)}% in <${(this.windowMs / 60000).toFixed(0)}m → fade`,
      ts: Date.now(),
    };
  }
}

export const momentumReversal = new MomentumReversalStrategy();

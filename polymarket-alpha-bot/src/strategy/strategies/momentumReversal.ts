import { Market, OrderBook, Trade } from '../../market/types';
import { Signal, Strategy } from '../types';
import { midPrice } from '../probabilityEngine';

const TRADE_WINDOW = 30;            // look at last 30 trades
const MOVE_THRESHOLD = 0.08;        // 8% move threshold
const TIME_WINDOW_MS = 10 * 60000;  // 10 minutes
const MAX_CONFIDENCE = 0.5;

// Per-token trade history
const tradeHistory: Map<string, Trade[]> = new Map();

export function recordTrade(trade: Trade): void {
  const history = tradeHistory.get(trade.tokenId) ?? [];
  history.push(trade);

  // Keep only the last 100 trades
  if (history.length > 100) history.splice(0, history.length - 100);
  tradeHistory.set(trade.tokenId, history);
}

export class MomentumReversalStrategy implements Strategy {
  name = 'MomentumReversal';

  async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    if (!market.outcomes[0]) return null;

    const tokenId = market.outcomes[0].tokenId;
    const history = tradeHistory.get(tokenId) ?? [];

    if (history.length < 5) return null;

    const now = Date.now();
    const recentTrades = history
      .filter((t) => now - t.timestamp < TIME_WINDOW_MS)
      .slice(-TRADE_WINDOW);

    if (recentTrades.length < 5) return null;

    const firstPrice = recentTrades[0].price;
    const lastPrice = recentTrades[recentTrades.length - 1].price;
    const priceMoveRaw = (lastPrice - firstPrice) / firstPrice;

    if (Math.abs(priceMoveRaw) < MOVE_THRESHOLD) return null;

    // Sharp move — bet on reversal
    const isSharpRise = priceMoveRaw > MOVE_THRESHOLD;
    const side: 'BUY' | 'SELL' = isSharpRise ? 'SELL' : 'BUY';

    const currentMid = midPrice(book);
    const expectedReversion = isSharpRise
      ? currentMid * (1 - Math.abs(priceMoveRaw) * 0.5)
      : currentMid * (1 + Math.abs(priceMoveRaw) * 0.5);

    const impliedProbability = Math.min(0.95, Math.max(0.05, expectedReversion));
    const edge = Math.abs(impliedProbability - currentMid);

    if (edge < 0.03) return null;

    return {
      conditionId: market.conditionId,
      tokenId,
      side,
      impliedProbability,
      marketProbability: currentMid,
      edge,
      confidence: Math.min(MAX_CONFIDENCE, Math.abs(priceMoveRaw) * 2),
      sizing: 30,
      strategyName: this.name,
      reasoning: `${isSharpRise ? 'Sharp rise' : 'Sharp drop'} of ${(priceMoveRaw * 100).toFixed(1)}% in last ${recentTrades.length} trades — fading as overreaction`,
    };
  }
}

export const momentumReversalStrategy = new MomentumReversalStrategy();

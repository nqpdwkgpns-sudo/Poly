import { Market, OrderBook } from '../../market/types';
import { Signal, Strategy } from '../types';
import { midPrice } from '../probabilityEngine';

const POLYMARKET_FEE = 0.02; // 2% fee round-trip
const ARB_THRESHOLD = 0.03;  // 3% minimum arb spread

export class SpreadArbitrageStrategy implements Strategy {
  name = 'SpreadArbitrage';

  async analyze(market: Market, yesBook: OrderBook): Promise<Signal | null> {
    if (market.outcomes.length < 2) return null;

    const yesMid = midPrice(yesBook);
    const noMid = 1 - yesMid;

    // In a binary market, YES + NO should sum to ~1.0
    // If YES_ask + NO_ask < 1 - fees, there's an arb opportunity
    const yesBestAsk = yesBook.bestAsk;
    const noBestAsk = 1 - yesBook.bestBid; // NO ask ≈ 1 - YES bid

    const totalCost = yesBestAsk + noBestAsk;
    const arbSpread = 1 - totalCost - POLYMARKET_FEE;

    if (arbSpread < ARB_THRESHOLD) return null;

    // Buy the cheaper side
    const buyYes = yesBestAsk < 0.5;
    const side: 'BUY' | 'SELL' = buyYes ? 'BUY' : 'SELL';
    const tokenId = market.outcomes[buyYes ? 0 : 1]?.tokenId ?? market.outcomes[0].tokenId;

    return {
      conditionId: market.conditionId,
      tokenId,
      side,
      impliedProbability: buyYes ? 1 - noBestAsk : noBestAsk,
      marketProbability: yesMid,
      edge: arbSpread,
      confidence: 0.85,
      sizing: 50, // conservative size for arb plays
      strategyName: this.name,
      reasoning: `YES+NO sum to ${totalCost.toFixed(3)}, arb spread ${(arbSpread * 100).toFixed(1)}%`,
    };
  }
}

export const spreadArbitrageStrategy = new SpreadArbitrageStrategy();

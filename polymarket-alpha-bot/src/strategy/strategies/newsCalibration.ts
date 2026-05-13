import axios from 'axios';
import { Market, OrderBook } from '../../market/types';
import { Signal, Strategy } from '../types';
import { midPrice, calibrate } from '../probabilityEngine';
import { logger } from '../../monitoring/logger';

const METACULUS_API = 'https://www.metaculus.com/api2/questions/';
const DIVERGENCE_THRESHOLD = 0.05;

interface MetaculusQuestion {
  id: number;
  title: string;
  community_prediction?: {
    full?: {
      q2: number; // median prediction
    };
  };
}

// Keyword-based prior probabilities when Metaculus unavailable
const KEYWORD_PRIORS: Array<{ keywords: string[]; prob: number }> = [
  { keywords: ['will pass', 'pass the bill', 'legislation'], prob: 0.35 },
  { keywords: ['re-elected', 'reelected', 'wins reelection'], prob: 0.45 },
  { keywords: ['above', 'exceed', 'higher than'], prob: 0.42 },
  { keywords: ['below', 'under', 'lower than'], prob: 0.42 },
  { keywords: ['first', 'historic', 'unprecedented'], prob: 0.25 },
  { keywords: ['convicted', 'found guilty'], prob: 0.40 },
  { keywords: ['reach', 'hit', 'achieve'], prob: 0.40 },
];

async function fetchMetaculusForecast(question: string): Promise<number | null> {
  try {
    const response = await axios.get<{ results: MetaculusQuestion[] }>(
      METACULUS_API,
      {
        params: { search: question.slice(0, 100), limit: 1, resolved: false },
        timeout: 5000,
      }
    );

    const results = response.data?.results ?? [];
    if (results.length === 0) return null;

    const topResult = results[0];
    const median = topResult.community_prediction?.full?.q2;
    return median ?? null;
  } catch {
    return null;
  }
}

function keywordBasedPrior(question: string): number {
  const lower = question.toLowerCase();
  for (const { keywords, prob } of KEYWORD_PRIORS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return prob;
    }
  }
  return 0.5;
}

export class NewsCalibrationStrategy implements Strategy {
  name = 'NewsCalibration';

  async analyze(market: Market, book: OrderBook): Promise<Signal | null> {
    const currentMid = midPrice(book);

    let externalForecast: number | null = null;
    let confidence = 0.3;

    try {
      externalForecast = await fetchMetaculusForecast(market.question);
      if (externalForecast !== null) confidence = 0.6;
    } catch (err) {
      logger.debug({ err, question: market.question }, 'Metaculus fetch failed, using keyword prior');
    }

    const rawForecast = externalForecast ?? keywordBasedPrior(market.question);
    const impliedProb = calibrate(rawForecast, confidence);
    const edge = impliedProb - currentMid;

    if (Math.abs(edge) < DIVERGENCE_THRESHOLD) return null;

    const side: 'BUY' | 'SELL' = edge > 0 ? 'BUY' : 'SELL';
    const tokenId = market.outcomes[0]?.tokenId ?? '';

    if (!tokenId) return null;

    return {
      conditionId: market.conditionId,
      tokenId,
      side,
      impliedProbability: impliedProb,
      marketProbability: currentMid,
      edge: Math.abs(edge),
      confidence,
      sizing: 20,
      strategyName: this.name,
      reasoning: externalForecast !== null
        ? `Metaculus forecast ${(rawForecast * 100).toFixed(1)}% vs market ${(currentMid * 100).toFixed(1)}%`
        : `Keyword prior ${(rawForecast * 100).toFixed(1)}% vs market ${(currentMid * 100).toFixed(1)}%`,
    };
  }
}

export const newsCalibrationStrategy = new NewsCalibrationStrategy();

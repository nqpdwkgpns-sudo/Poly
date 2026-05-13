import fs from 'fs';
import path from 'path';
import { Market } from '../market/types';
import { POSITIONS_FILE, PROFIT_TARGET_PCT, STOP_LOSS_PCT } from '../config/constants';
import { logger } from '../monitoring/logger';
import { buildMarketOrder, signOrder } from '../wallet/orderSigner';
import { orderManager } from './orderManager';

export interface Position {
  conditionId: string;
  tokenId: string;
  marketQuestion: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice: number;
  size: number;           // USDC notional
  shares: number;         // number of outcome tokens
  orderId: string;
  openedAt: number;
  category: string;
  unrealizedPnl: number;
  realizedPnl: number;
  status: 'OPEN' | 'CLOSED' | 'CLOSING';
}

export class PositionTracker {
  private positions: Map<string, Position> = new Map();
  private realizedPnl = 0;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const dir = path.dirname(POSITIONS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (fs.existsSync(POSITIONS_FILE)) {
        const raw = fs.readFileSync(POSITIONS_FILE, 'utf-8');
        const data = JSON.parse(raw) as { positions: Position[]; realizedPnl: number };
        this.realizedPnl = data.realizedPnl ?? 0;
        for (const p of data.positions ?? []) {
          if (p.status === 'OPEN') {
            this.positions.set(p.conditionId, p);
          }
        }
        logger.info({ count: this.positions.size }, 'Loaded positions from disk');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to load positions from disk');
    }
  }

  saveToDisk(): void {
    try {
      const dir = path.dirname(POSITIONS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const data = {
        positions: Array.from(this.positions.values()),
        realizedPnl: this.realizedPnl,
        savedAt: new Date().toISOString(),
      };
      fs.writeFileSync(POSITIONS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      logger.error({ err }, 'Failed to save positions to disk');
    }
  }

  openPosition(market: Market, side: 'BUY' | 'SELL', price: number, size: number, orderId: string): Position {
    const tokenId = market.outcomes[side === 'BUY' ? 0 : 1]?.tokenId ?? market.outcomes[0].tokenId;
    const shares = size / price;

    const position: Position = {
      conditionId: market.conditionId,
      tokenId,
      marketQuestion: market.question,
      side,
      entryPrice: price,
      currentPrice: price,
      size,
      shares,
      orderId,
      openedAt: Date.now(),
      category: market.category,
      unrealizedPnl: 0,
      realizedPnl: 0,
      status: 'OPEN',
    };

    this.positions.set(market.conditionId, position);
    this.saveToDisk();
    logger.info({ conditionId: market.conditionId, side, price, size }, 'Position opened');

    return position;
  }

  updatePrice(conditionId: string, currentPrice: number): void {
    const position = this.positions.get(conditionId);
    if (!position || position.status !== 'OPEN') return;

    position.currentPrice = currentPrice;
    const currentValue = position.shares * currentPrice;
    position.unrealizedPnl = currentValue - position.size;
  }

  async closePosition(conditionId: string): Promise<void> {
    const position = this.positions.get(conditionId);
    if (!position || position.status !== 'OPEN') return;

    position.status = 'CLOSING';

    try {
      const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';
      const closeOrder = buildMarketOrder({
        tokenId: position.tokenId,
        side: closeSide,
        size: position.size,
      });

      const signedClose = await signOrder(closeOrder);
      await orderManager.submitOrder(signedClose, position.currentPrice, position.size);

      const exitValue = position.shares * position.currentPrice;
      position.realizedPnl = exitValue - position.size;
      this.realizedPnl += position.realizedPnl;
      position.status = 'CLOSED';

      logger.info(
        { conditionId, realizedPnl: position.realizedPnl },
        'Position closed'
      );
    } catch (err) {
      position.status = 'OPEN';
      logger.error({ err, conditionId }, 'Failed to close position');
      throw err;
    } finally {
      this.saveToDisk();
    }
  }

  getPosition(conditionId: string): Position | undefined {
    return this.positions.get(conditionId);
  }

  getOpenPositions(): Position[] {
    return Array.from(this.positions.values()).filter((p) => p.status === 'OPEN');
  }

  getNetExposure(): number {
    return this.getOpenPositions().reduce((sum, p) => sum + p.size, 0);
  }

  getPnl(): { realized: number; unrealized: number; total: number } {
    const unrealized = this.getOpenPositions().reduce((sum, p) => sum + p.unrealizedPnl, 0);
    return {
      realized: this.realizedPnl,
      unrealized,
      total: this.realizedPnl + unrealized,
    };
  }

  checkExitConditions(): string[] {
    const toClose: string[] = [];

    for (const position of this.getOpenPositions()) {
      const pnlPct = position.unrealizedPnl / position.size;

      if (pnlPct >= PROFIT_TARGET_PCT) {
        logger.info({ conditionId: position.conditionId, pnlPct }, 'Taking profit');
        toClose.push(position.conditionId);
      } else if (pnlPct <= -STOP_LOSS_PCT) {
        logger.warn({ conditionId: position.conditionId, pnlPct }, 'Stop loss triggered');
        toClose.push(position.conditionId);
      }
    }

    return toClose;
  }

  getExposureByCategory(): Record<string, number> {
    const exposure: Record<string, number> = {};
    for (const position of this.getOpenPositions()) {
      exposure[position.category] = (exposure[position.category] ?? 0) + position.size;
    }
    return exposure;
  }
}

export const positionTracker = new PositionTracker();

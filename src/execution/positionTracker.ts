import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '../config/env.js';
import type { Market, OrderSide } from '../market/types.js';
import type { Position } from '../risk/state.js';

export class PositionTracker {
  readonly positions = new Map<string, Position>();

  constructor(private readonly filePath = join(config.DATA_DIR, 'positions.json')) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const rows = JSON.parse(raw) as Position[];
      this.positions.clear();
      rows.forEach((position) => this.positions.set(position.conditionId, position));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify([...this.positions.values()], null, 2));
  }

  async openPosition(market: Market, side: OrderSide, price: number, size: number, tokenId = market.tokenIds[0] ?? ''): Promise<Position> {
    const position: Position = {
      conditionId: market.conditionId,
      tokenId,
      marketQuestion: market.question,
      category: market.category,
      side,
      entryPrice: price,
      currentPrice: price,
      size,
      openedAt: new Date().toISOString(),
      realizedPnl: 0,
      unrealizedPnl: 0
    };
    this.positions.set(position.conditionId, position);
    await this.save();
    return position;
  }

  async closePosition(conditionId: string, exitPrice?: number): Promise<Position | null> {
    const position = this.positions.get(conditionId);
    if (!position) return null;
    const price = exitPrice ?? position.currentPrice;
    const direction = position.side === 'BUY' ? 1 : -1;
    position.realizedPnl += (price - position.entryPrice) * position.size * direction;
    position.unrealizedPnl = 0;
    this.positions.delete(conditionId);
    await this.save();
    return position;
  }

  updateMark(conditionId: string, currentPrice: number): void {
    const position = this.positions.get(conditionId);
    if (!position) return;
    position.currentPrice = currentPrice;
    const direction = position.side === 'BUY' ? 1 : -1;
    position.unrealizedPnl = (currentPrice - position.entryPrice) * position.size * direction;
  }

  getNetExposure(): number {
    return [...this.positions.values()].reduce((sum, position) => sum + position.entryPrice * position.size, 0);
  }

  getPnl(): { realized: number; unrealized: number; total: number } {
    const realized = [...this.positions.values()].reduce((sum, position) => sum + position.realizedPnl, 0);
    const unrealized = [...this.positions.values()].reduce((sum, position) => sum + position.unrealizedPnl, 0);
    return { realized, unrealized, total: realized + unrealized };
  }
}

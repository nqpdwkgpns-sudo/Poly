import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "../monitoring/logger.js";
import type { Market, Side } from "../market/types.js";

export interface Position {
  conditionId: string;
  tokenId: string;
  marketQuestion: string;
  category: string;
  side: Side;
  entryPrice: number;
  currentPrice: number;
  size: number;
  openedAt: number;
  realizedPnl: number;
}

const POSITIONS_FILE = path.resolve("data/positions.json");

export class PositionTracker {
  private readonly openPositions = new Map<string, Position>();

  public async load(): Promise<void> {
    try {
      const data = await fs.readFile(POSITIONS_FILE, "utf8");
      const parsed = JSON.parse(data) as Position[];
      parsed.forEach((position) => this.openPositions.set(position.conditionId, position));
    } catch {
      await this.persist();
    }
  }

  public async persist(): Promise<void> {
    const rows = [...this.openPositions.values()];
    await fs.mkdir(path.dirname(POSITIONS_FILE), { recursive: true });
    await fs.writeFile(POSITIONS_FILE, JSON.stringify(rows, null, 2), "utf8");
  }

  public openPosition(market: Market, side: Side, price: number, size: number): Position {
    const position: Position = {
      conditionId: market.conditionId,
      tokenId: market.tokenIds[side === "BUY" ? 0 : 1] ?? market.tokenIds[0] ?? "",
      marketQuestion: market.question,
      category: market.category,
      side,
      entryPrice: price,
      currentPrice: price,
      size,
      openedAt: Date.now(),
      realizedPnl: 0
    };
    this.openPositions.set(position.conditionId, position);
    return position;
  }

  public closePosition(conditionId: string, exitPrice?: number): Position | null {
    const existing = this.openPositions.get(conditionId);
    if (!existing) {
      return null;
    }
    const px = exitPrice ?? existing.currentPrice;
    const direction = existing.side === "BUY" ? 1 : -1;
    existing.realizedPnl += (px - existing.entryPrice) * existing.size * direction;
    this.openPositions.delete(conditionId);
    return existing;
  }

  public updateMark(conditionId: string, currentPrice: number): void {
    const existing = this.openPositions.get(conditionId);
    if (!existing) {
      return;
    }
    existing.currentPrice = currentPrice;
  }

  public getOpenPositions(): Map<string, Position> {
    return this.openPositions;
  }

  public getNetExposure(): number {
    return [...this.openPositions.values()].reduce((acc, position) => acc + position.entryPrice * position.size, 0);
  }

  public getPnl(): { realized: number; unrealized: number; total: number } {
    const unrealized = [...this.openPositions.values()].reduce((acc, position) => {
      const direction = position.side === "BUY" ? 1 : -1;
      return acc + (position.currentPrice - position.entryPrice) * position.size * direction;
    }, 0);
    const realized = [...this.openPositions.values()].reduce((acc, position) => acc + position.realizedPnl, 0);
    return { realized, unrealized, total: realized + unrealized };
  }

  public async snapshot(): Promise<void> {
    await this.persist();
    logger.info({ openPositions: this.openPositions.size }, "positions snapshot saved");
  }
}

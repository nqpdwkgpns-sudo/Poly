import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { child } from '../monitoring/logger.js';
import { DATA_DIR, POSITIONS_FILE } from '../config/constants.js';
import { Market, MarketCategory, OrderSide, Position } from '../market/types.js';

const log = child('positionTracker');

interface PersistedState {
  positions: Position[];
  realizedPnl: number;
  updatedAt: number;
}

export class PositionTracker extends EventEmitter {
  private readonly positions = new Map<string, Position>();
  private realizedPnl = 0;
  private readonly filePath: string;

  constructor(filePath: string = path.join(DATA_DIR, POSITIONS_FILE)) {
    super();
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    try {
      const buf = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(buf) as PersistedState;
      this.positions.clear();
      for (const p of parsed.positions ?? []) this.positions.set(p.conditionId, p);
      this.realizedPnl = parsed.realizedPnl ?? 0;
      log.info({ count: this.positions.size, realizedPnl: this.realizedPnl }, 'positions loaded');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn({ err: (err as Error).message }, 'failed to load positions');
      }
    }
  }

  async save(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const payload: PersistedState = {
        positions: [...this.positions.values()],
        realizedPnl: this.realizedPnl,
        updatedAt: Date.now(),
      };
      await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2));
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'failed to save positions');
    }
  }

  getAll(): Position[] {
    return [...this.positions.values()];
  }

  get(conditionId: string): Position | undefined {
    return this.positions.get(conditionId);
  }

  getNetExposure(): number {
    let total = 0;
    for (const p of this.positions.values()) total += p.size;
    return total;
  }

  getCategoryExposure(): Record<MarketCategory, number> {
    const out: Record<MarketCategory, number> = {
      politics: 0,
      crypto: 0,
      sports: 0,
      economics: 0,
      culture: 0,
      science: 0,
      other: 0,
    };
    for (const p of this.positions.values()) out[p.category] += p.size;
    return out;
  }

  getPnl(): { realized: number; unrealized: number; total: number } {
    let unrealized = 0;
    for (const p of this.positions.values()) unrealized += p.unrealizedPnl;
    return { realized: this.realizedPnl, unrealized, total: this.realizedPnl + unrealized };
  }

  openPosition(
    market: Market,
    tokenId: string,
    side: OrderSide,
    price: number,
    size: number,
  ): Position {
    const shares = side === 'BUY' ? size / price : size / (1 - price);
    const pos: Position = {
      conditionId: market.conditionId,
      tokenId,
      market: market.question,
      side,
      entryPrice: price,
      currentPrice: price,
      size,
      shares,
      openedAt: Date.now(),
      category: market.category,
      realizedPnl: 0,
      unrealizedPnl: 0,
    };
    this.positions.set(market.conditionId, pos);
    void this.save();
    this.emit('position_opened', pos);
    log.info(
      { conditionId: market.conditionId, side, price, size, category: market.category },
      'position opened',
    );
    return pos;
  }

  /** Mark a position to a fresh price, updating unrealized PnL. */
  markPosition(conditionId: string, currentPrice: number): Position | undefined {
    const p = this.positions.get(conditionId);
    if (!p) return undefined;
    p.currentPrice = currentPrice;
    const delta =
      p.side === 'BUY'
        ? (currentPrice - p.entryPrice) * p.shares
        : (p.entryPrice - currentPrice) * p.shares;
    p.unrealizedPnl = delta;
    return p;
  }

  closePosition(conditionId: string, exitPrice: number): Position | undefined {
    const p = this.positions.get(conditionId);
    if (!p) return undefined;
    const realized =
      p.side === 'BUY'
        ? (exitPrice - p.entryPrice) * p.shares
        : (p.entryPrice - exitPrice) * p.shares;
    this.realizedPnl += realized;
    p.realizedPnl = realized;
    p.unrealizedPnl = 0;
    p.currentPrice = exitPrice;
    this.positions.delete(conditionId);
    void this.save();
    this.emit('position_closed', { ...p, realizedPnl: realized });
    log.info({ conditionId, exitPrice, realized }, 'position closed');
    return p;
  }
}

export const positionTracker = new PositionTracker();

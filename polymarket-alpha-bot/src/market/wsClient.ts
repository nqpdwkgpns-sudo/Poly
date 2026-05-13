import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { config } from '../config/env.js';
import { child } from '../monitoring/logger.js';
import { OrderBook, OrderBookLevel, Trade } from './types.js';

const log = child('ws');

export interface WsEvents {
  orderbook_update: (book: OrderBook) => void;
  trade: (trade: Trade) => void;
  market_resolved: (payload: { conditionId: string; outcome: string }) => void;
  open: () => void;
  close: (code: number) => void;
  error: (err: Error) => void;
}

export class PolymarketWsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly subscriptions = new Set<string>();
  private readonly books = new Map<string, OrderBook>();
  private reconnectAttempts = 0;
  private closing = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(private readonly url: string = config.POLYMARKET_WS_URL) {
    super();
  }

  connect(): void {
    this.closing = false;
    log.info({ url: this.url }, 'ws connecting');
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      log.info('ws open');
      this.resubscribeAll();
      this.startHeartbeat();
      this.emit('open');
    });

    this.ws.on('message', (raw: WebSocket.RawData) => this.handleMessage(raw));

    this.ws.on('close', (code) => {
      this.stopHeartbeat();
      log.warn({ code }, 'ws closed');
      this.emit('close', code);
      if (!this.closing) this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      log.error({ err: err.message }, 'ws error');
      this.emit('error', err);
    });
  }

  subscribe(tokenIds: string[]): void {
    for (const t of tokenIds) this.subscriptions.add(t);
    if (this.ws?.readyState === WebSocket.OPEN) this.sendSubscribe(tokenIds);
  }

  unsubscribe(tokenIds: string[]): void {
    for (const t of tokenIds) this.subscriptions.delete(t);
  }

  getBook(tokenId: string): OrderBook | undefined {
    return this.books.get(tokenId);
  }

  getAllBooks(): Map<string, OrderBook> {
    return this.books;
  }

  close(): void {
    this.closing = true;
    this.stopHeartbeat();
    this.ws?.close();
  }

  private sendSubscribe(tokenIds: string[]): void {
    const msg = {
      type: 'Market',
      assets_ids: tokenIds,
    };
    this.ws?.send(JSON.stringify(msg));
    log.debug({ count: tokenIds.length }, 'ws subscribed');
  }

  private resubscribeAll(): void {
    if (this.subscriptions.size === 0) return;
    this.sendSubscribe([...this.subscriptions]);
  }

  private handleMessage(raw: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const events = Array.isArray(parsed) ? parsed : [parsed];
    for (const ev of events) this.dispatch(ev as Record<string, unknown>);
  }

  private dispatch(ev: Record<string, unknown>): void {
    const eventType = (ev.event_type as string) ?? (ev.type as string);
    const assetId = (ev.asset_id as string) ?? (ev.market as string);
    switch (eventType) {
      case 'book': {
        const bids = (ev.bids as Array<{ price: string; size: string }>) ?? [];
        const asks = (ev.asks as Array<{ price: string; size: string }>) ?? [];
        const book: OrderBook = {
          tokenId: assetId,
          bids: bids
            .map((l) => ({ price: Number(l.price), size: Number(l.size) }))
            .sort((a, b) => b.price - a.price) as OrderBookLevel[],
          asks: asks
            .map((l) => ({ price: Number(l.price), size: Number(l.size) }))
            .sort((a, b) => a.price - b.price) as OrderBookLevel[],
          timestamp: Number(ev.timestamp) || Date.now(),
        };
        this.books.set(assetId, book);
        this.emit('orderbook_update', book);
        break;
      }
      case 'price_change': {
        const book = this.books.get(assetId);
        if (book) {
          const changes = (ev.changes as Array<{ price: string; size: string; side: string }>) ?? [];
          for (const c of changes) {
            const price = Number(c.price);
            const size = Number(c.size);
            const side = c.side?.toLowerCase() === 'sell' ? book.asks : book.bids;
            const idx = side.findIndex((l) => l.price === price);
            if (size === 0 && idx >= 0) side.splice(idx, 1);
            else if (idx >= 0) side[idx].size = size;
            else side.push({ price, size });
          }
          book.bids.sort((a, b) => b.price - a.price);
          book.asks.sort((a, b) => a.price - b.price);
          book.timestamp = Date.now();
          this.emit('orderbook_update', book);
        }
        break;
      }
      case 'last_trade_price':
      case 'trade': {
        const trade: Trade = {
          tokenId: assetId,
          price: Number(ev.price ?? 0),
          size: Number(ev.size ?? 0),
          side: ((ev.side as string)?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY') as Trade['side'],
          timestamp: Number(ev.timestamp) || Date.now(),
        };
        this.emit('trade', trade);
        break;
      }
      case 'market_resolved': {
        this.emit('market_resolved', {
          conditionId: (ev.condition_id as string) ?? assetId,
          outcome: (ev.outcome as string) ?? 'unknown',
        });
        break;
      }
      default:
        log.trace({ eventType }, 'ws event ignored');
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    log.warn({ delayMs: delay, attempt: this.reconnectAttempts }, 'ws reconnect scheduled');
    setTimeout(() => {
      if (!this.closing) this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch {
          /* noop */
        }
      }
    }, 25_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export const wsClient = new PolymarketWsClient();

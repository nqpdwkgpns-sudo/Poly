import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { config } from '../config/env.js';
import { logger } from '../monitoring/logger.js';
import type { OrderBook, Trade } from './types.js';

export interface MarketResolvedEvent {
  conditionId: string;
  resolvedAt: number;
}

interface WsEvents {
  orderbook_update: [OrderBook];
  trade: [Trade];
  market_resolved: [MarketResolvedEvent];
  error: [Error];
  connected: [];
  disconnected: [];
}

export class PolymarketWsClient extends EventEmitter {
  private socket?: WebSocket;
  private reconnectAttempt = 0;
  private stopped = false;
  private subscriptions = new Set<string>();
  readonly orderBooks = new Map<string, OrderBook>();

  constructor(private readonly url = config.POLYMARKET_WS_URL) {
    super();
  }

  override on<K extends keyof WsEvents>(event: K, listener: (...args: WsEvents[K]) => void): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof WsEvents>(event: K, ...args: WsEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  connect(tokenIds: string[] = []): void {
    this.stopped = false;
    tokenIds.forEach((tokenId) => this.subscriptions.add(tokenId));
    this.socket = new WebSocket(this.url);
    this.socket.on('open', () => {
      this.reconnectAttempt = 0;
      this.emit('connected');
      this.flushSubscriptions();
    });
    this.socket.on('message', (data) => this.handleMessage(data.toString()));
    this.socket.on('close', () => {
      this.emit('disconnected');
      if (!this.stopped) this.scheduleReconnect();
    });
    this.socket.on('error', (error) => this.emit('error', error));
  }

  subscribe(tokenId: string): void {
    this.subscriptions.add(tokenId);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'subscribe', assets_ids: [tokenId] }));
    }
  }

  close(): void {
    this.stopped = true;
    this.socket?.close();
  }

  getOrderBook(tokenId: string): OrderBook | undefined {
    return this.orderBooks.get(tokenId);
  }

  private flushSubscriptions(): void {
    if (this.subscriptions.size === 0) return;
    this.socket?.send(JSON.stringify({ type: 'subscribe', assets_ids: [...this.subscriptions] }));
  }

  private scheduleReconnect(): void {
    const delay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt++);
    logger.warn({ delay }, 'market websocket reconnect scheduled');
    setTimeout(() => this.connect([...this.subscriptions]), delay).unref();
  }

  private handleMessage(message: string): void {
    try {
      const parsed = JSON.parse(message) as Record<string, unknown>;
      const eventType = String(parsed.event_type ?? parsed.type ?? '');
      if (eventType.includes('book')) {
        const tokenId = String(parsed.asset_id ?? parsed.token_id ?? parsed.tokenId ?? '');
        const book: OrderBook = {
          tokenId,
          bids: levels(parsed.bids),
          asks: levels(parsed.asks),
          timestamp: Number(parsed.timestamp ?? Date.now())
        };
        this.orderBooks.set(tokenId, book);
        this.emit('orderbook_update', book);
      } else if (eventType.includes('trade')) {
        this.emit('trade', {
          id: String(parsed.id ?? `${parsed.asset_id}-${Date.now()}`),
          tokenId: String(parsed.asset_id ?? parsed.token_id ?? ''),
          side: String(parsed.side ?? 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
          price: Number(parsed.price ?? 0),
          size: Number(parsed.size ?? 0),
          timestamp: Number(parsed.timestamp ?? Date.now())
        });
      } else if (eventType.includes('resolved')) {
        this.emit('market_resolved', { conditionId: String(parsed.condition_id ?? ''), resolvedAt: Date.now() });
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function levels(value: unknown): Array<{ price: number; size: number }> {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const item = row as Record<string, unknown>;
    return { price: Number(item.price ?? item[0] ?? 0), size: Number(item.size ?? item[1] ?? 0) };
  }).filter((level) => level.size > 0);
}

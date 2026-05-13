import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { OrderBook, PriceLevel, Trade } from './types';
import { CLOB_WS_URL } from '../config/constants';

interface WsOrderBookMessage {
  event_type: 'book' | 'price_change';
  asset_id: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  timestamp: string;
}

interface WsTradeMessage {
  event_type: 'last_trade_price';
  asset_id: string;
  price: string;
  size: string;
  side: string;
  timestamp: string;
}

interface WsMarketResolvedMessage {
  event_type: 'market_resolved';
  condition_id: string;
  outcome: string;
  timestamp: string;
}

export declare interface PolymarketWsClient {
  on(event: 'orderbook_update', listener: (book: OrderBook) => void): this;
  on(event: 'trade', listener: (trade: Trade) => void): this;
  on(event: 'market_resolved', listener: (conditionId: string, outcome: string) => void): this;
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: () => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
}

export class PolymarketWsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private subscribedTokenIds: Set<string> = new Set();
  private orderBookCache: Map<string, OrderBook> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private isClosed = false;

  constructor() {
    super();
  }

  connect(): void {
    if (this.isClosed) return;

    this.ws = new WebSocket(CLOB_WS_URL);

    this.ws.on('open', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');

      if (this.subscribedTokenIds.size > 0) {
        this.sendSubscription(Array.from(this.subscribedTokenIds));
      }
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      try {
        const messages = JSON.parse(data.toString());
        const msgArray = Array.isArray(messages) ? messages : [messages];
        for (const msg of msgArray) {
          this.handleMessage(msg);
        }
      } catch {
        // ignore malformed messages
      }
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  private handleMessage(msg: WsOrderBookMessage | WsTradeMessage | WsMarketResolvedMessage): void {
    switch (msg.event_type) {
      case 'book':
      case 'price_change': {
        const bookMsg = msg as WsOrderBookMessage;
        const bids: PriceLevel[] = bookMsg.bids
          .map((b) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }))
          .filter((b) => b.size > 0)
          .sort((a, b) => b.price - a.price);

        const asks: PriceLevel[] = bookMsg.asks
          .map((a) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
          .filter((a) => a.size > 0)
          .sort((a, b) => a.price - b.price);

        const bestBid = bids.length > 0 ? bids[0].price : 0;
        const bestAsk = asks.length > 0 ? asks[0].price : 1;

        const book: OrderBook = {
          tokenId: bookMsg.asset_id,
          bids,
          asks,
          bestBid,
          bestAsk,
          midPrice: (bestBid + bestAsk) / 2,
          spread: bestAsk - bestBid,
          timestamp: parseInt(bookMsg.timestamp, 10) || Date.now(),
        };

        this.orderBookCache.set(bookMsg.asset_id, book);
        this.emit('orderbook_update', book);
        break;
      }

      case 'last_trade_price': {
        const tradeMsg = msg as WsTradeMessage;
        const trade: Trade = {
          id: `${tradeMsg.asset_id}-${tradeMsg.timestamp}`,
          tokenId: tradeMsg.asset_id,
          price: parseFloat(tradeMsg.price),
          size: parseFloat(tradeMsg.size),
          side: tradeMsg.side === 'BUY' ? 'BUY' : 'SELL',
          timestamp: parseInt(tradeMsg.timestamp, 10) || Date.now(),
          makerOrderId: '',
          takerOrderId: '',
        };
        this.emit('trade', trade);
        break;
      }

      case 'market_resolved': {
        const resolvedMsg = msg as WsMarketResolvedMessage;
        this.emit('market_resolved', resolvedMsg.condition_id, resolvedMsg.outcome);
        break;
      }
    }
  }

  private sendSubscription(tokenIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const subscribeMsg = {
      auth: {},
      type: 'Market',
      markets: tokenIds,
    };

    this.ws.send(JSON.stringify(subscribeMsg));
  }

  subscribe(tokenIds: string[]): void {
    for (const id of tokenIds) this.subscribedTokenIds.add(id);
    if (this.isConnected) {
      this.sendSubscription(tokenIds);
    }
  }

  unsubscribe(tokenId: string): void {
    this.subscribedTokenIds.delete(tokenId);
  }

  getOrderBook(tokenId: string): OrderBook | undefined {
    return this.orderBookCache.get(tokenId);
  }

  getAllOrderBooks(): Map<string, OrderBook> {
    return new Map(this.orderBookCache);
  }

  private scheduleReconnect(): void {
    if (this.isClosed || this.reconnectAttempts >= this.maxReconnectAttempts) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect(): void {
    this.isClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }
}

export const wsClient = new PolymarketWsClient();

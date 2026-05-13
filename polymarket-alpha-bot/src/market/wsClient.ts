import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { logger } from "../monitoring/logger.js";
import type { OrderBook, Trade, WsMarketEvent } from "./types.js";

export class WsClient extends EventEmitter {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly url = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
  private readonly subscribedTokenIds = new Set<string>();
  private readonly orderBooks = new Map<string, OrderBook>();

  public connect(): void {
    this.openSocket();
  }

  public disconnect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
    this.socket = null;
  }

  public subscribe(tokenIds: string[]): void {
    tokenIds.forEach((tokenId) => this.subscribedTokenIds.add(tokenId));
    this.flushSubscriptions();
  }

  public getOrderBook(tokenId: string): OrderBook | undefined {
    return this.orderBooks.get(tokenId);
  }

  public getOrderBookCache(): Map<string, OrderBook> {
    return this.orderBooks;
  }

  private openSocket(): void {
    this.socket = new WebSocket(this.url);

    this.socket.on("open", () => {
      this.reconnectAttempts = 0;
      logger.info("ws connected");
      this.flushSubscriptions();
    });

    this.socket.on("message", (raw) => {
      try {
        const payload = JSON.parse(raw.toString()) as Record<string, unknown>;
        this.handleMessage(payload);
      } catch (error) {
        logger.warn({ err: error }, "ws parse error");
      }
    });

    this.socket.on("close", () => {
      logger.warn("ws disconnected");
      this.scheduleReconnect();
    });

    this.socket.on("error", (error) => {
      logger.error({ err: error }, "ws error");
    });
  }

  private flushSubscriptions(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.subscribedTokenIds.size === 0) {
      return;
    }
    this.socket.send(JSON.stringify({ type: "subscribe", assets_ids: [...this.subscribedTokenIds] }));
  }

  private scheduleReconnect(): void {
    const backoff = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    setTimeout(() => this.openSocket(), backoff);
  }

  private handleMessage(payload: Record<string, unknown>): void {
    const eventType = String(payload.event_type ?? payload.type ?? "");
    if (eventType === "book") {
      const tokenId = String(payload.asset_id ?? "");
      const bids = Array.isArray(payload.bids) ? payload.bids : [];
      const asks = Array.isArray(payload.asks) ? payload.asks : [];
      const book: OrderBook = {
        tokenId,
        bids: bids.map((b) => ({ price: Number((b as Record<string, unknown>).price), size: Number((b as Record<string, unknown>).size) })),
        asks: asks.map((a) => ({ price: Number((a as Record<string, unknown>).price), size: Number((a as Record<string, unknown>).size) })),
        timestamp: Date.now()
      };
      this.orderBooks.set(tokenId, book);
      const event: WsMarketEvent = {
        eventType: "orderbook_update",
        tokenId,
        bids: book.bids,
        asks: book.asks,
        timestamp: book.timestamp
      };
      this.emit("orderbook_update", event);
      return;
    }

    if (eventType === "trade") {
      const trade: Trade = {
        tradeId: String(payload.id ?? ""),
        tokenId: String(payload.asset_id ?? ""),
        price: Number(payload.price ?? 0),
        size: Number(payload.size ?? 0),
        side: String(payload.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
        timestamp: Number(payload.timestamp ?? Date.now())
      };
      this.emit("trade", { eventType: "trade", trade } satisfies WsMarketEvent);
      return;
    }

    if (eventType === "market_resolved") {
      this.emit("market_resolved", {
        eventType: "market_resolved",
        conditionId: String(payload.condition_id ?? ""),
        resolvedOutcome: String(payload.resolved_outcome ?? ""),
        timestamp: Number(payload.timestamp ?? Date.now())
      } satisfies WsMarketEvent);
    }
  }
}

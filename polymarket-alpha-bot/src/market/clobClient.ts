import { Wallet, keccak256, toUtf8Bytes } from "ethers";
import { config } from "../config/env.js";
import { logger } from "../monitoring/logger.js";
import type { LimitOrder, MarketPrice, Order, OrderBook, Trade } from "./types.js";
import { buildHttpClient } from "./http.js";

interface ClobOrderBookResponse {
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

interface ClobTradeResponse {
  id: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  timestamp: string;
}

export class ClobClient {
  private readonly client = buildHttpClient(config.POLYMARKET_CLOB_URL);
  private readonly wallet = new Wallet(config.PHANTOM_PRIVATE_KEY);

  constructor() {
    if (config.POLYMARKET_API_KEY) {
      this.client.defaults.headers.common.Authorization = `Bearer ${config.POLYMARKET_API_KEY}`;
    }
  }

  public async fetchOrderBook(tokenId: string): Promise<OrderBook> {
    const response = await this.client
      .get<ClobOrderBookResponse>(`/book`, { params: { token_id: tokenId } })
      .catch((error: unknown) => {
        logger.error({ err: error, tokenId }, "clob fetchOrderBook failed");
        throw new Error(`CLOB fetchOrderBook failed for token ${tokenId}`);
      });

    return {
      tokenId,
      bids: response.data.bids.map((level) => ({ price: Number(level.price), size: Number(level.size) })),
      asks: response.data.asks.map((level) => ({ price: Number(level.price), size: Number(level.size) })),
      timestamp: Date.now()
    };
  }

  public async fetchMarketPrice(tokenId: string): Promise<MarketPrice> {
    const orderBook = await this.fetchOrderBook(tokenId);
    const bestBid = orderBook.bids[0]?.price ?? 0;
    const bestAsk = orderBook.asks[0]?.price ?? 1;
    const mid = (bestBid + bestAsk) / 2;
    return {
      tokenId,
      bestBid,
      bestAsk,
      mid,
      spread: Math.max(0, bestAsk - bestBid)
    };
  }

  public async fetchRecentTrades(tokenId: string, limit = 30): Promise<Trade[]> {
    const response = await this.client
      .get<ClobTradeResponse[]>(`/trades`, { params: { token_id: tokenId, limit } })
      .catch((error: unknown) => {
        logger.error({ err: error, tokenId, limit }, "clob fetchRecentTrades failed");
        throw new Error(`CLOB fetchRecentTrades failed for token ${tokenId}`);
      });

    return response.data.map((trade) => ({
      tradeId: trade.id,
      tokenId,
      price: Number(trade.price),
      size: Number(trade.size),
      side: trade.side,
      timestamp: Number(new Date(trade.timestamp))
    }));
  }

  public async placeOrder(order: LimitOrder & Record<string, unknown>): Promise<{ orderId: string }> {
    const payload = JSON.stringify(order);
    const l2 = await this.wallet.signMessage(payload);
    const l1 = await this.wallet.signMessage(keccak256(toUtf8Bytes(payload)));

    const response = await this.client
      .post<{ orderID?: string; id?: string }>(
        `/order`,
        order,
        {
          headers: {
            "POLY_ADDRESS": await this.wallet.getAddress(),
            "POLY_SIGNATURE": l1,
            "POLY_L2_SIGNATURE": l2
          }
        }
      )
      .catch((error: unknown) => {
        logger.error({ err: error, order }, "clob placeOrder failed");
        throw new Error("CLOB placeOrder failed");
      });

    const orderId = response.data.orderID ?? response.data.id;
    if (!orderId) {
      throw new Error("CLOB did not return an order id");
    }
    return { orderId };
  }

  public async cancelOrder(orderId: string): Promise<void> {
    await this.client.delete(`/order`, { data: { orderID: orderId } }).catch((error: unknown) => {
      logger.error({ err: error, orderId }, "clob cancelOrder failed");
      throw new Error(`CLOB cancelOrder failed for ${orderId}`);
    });
  }

  public async getOpenOrders(address: string): Promise<Order[]> {
    const response = await this.client
      .get<Array<Record<string, unknown>>>(`/orders`, { params: { owner: address, status: "open" } })
      .catch((error: unknown) => {
        logger.error({ err: error, address }, "clob getOpenOrders failed");
        throw new Error("CLOB getOpenOrders failed");
      });

    return response.data.map((order) => ({
      id: String(order.id ?? order.orderID ?? ""),
      tokenId: String(order.asset_id ?? order.tokenId ?? ""),
      side: (String(order.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY"),
      price: Number(order.price ?? 0),
      size: Number(order.size ?? 0),
      status: "OPEN",
      createdAt: Number(order.created_at ?? Date.now())
    }));
  }
}

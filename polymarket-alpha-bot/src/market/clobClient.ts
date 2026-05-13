import pLimit from 'p-limit';
import { AxiosInstance } from 'axios';
import { config } from '../config/env.js';
import { child } from '../monitoring/logger.js';
import { createHttpClient } from './http.js';
import { OrderBook, OrderBookLevel, SignedOrder, Trade, Order, OrderSide } from './types.js';

const log = child('clob');

interface ClobBookLevel {
  price: string;
  size: string;
}
interface ClobBookResponse {
  market?: string;
  asset_id?: string;
  bids?: ClobBookLevel[];
  asks?: ClobBookLevel[];
  timestamp?: string | number;
}
interface ClobTradeRaw {
  asset_id: string;
  price: string;
  size: string;
  side: string;
  timestamp: string | number;
  taker_order_id?: string;
  maker_order_id?: string;
}

function parseLevels(arr?: ClobBookLevel[]): OrderBookLevel[] {
  if (!arr) return [];
  return arr
    .map((l) => ({ price: Number(l.price), size: Number(l.size) }))
    .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size));
}

export type ClobAuthHeaderProvider = (opts: {
  method: string;
  path: string;
  bodyHash?: string;
  ts: number;
}) => Promise<Record<string, string>> | Record<string, string>;

export class ClobClient {
  private readonly http: AxiosInstance;
  private readonly limit = pLimit(10);
  private authProvider?: ClobAuthHeaderProvider;

  constructor(baseUrl: string = config.POLYMARKET_CLOB_URL) {
    this.http = createHttpClient(baseUrl);
  }

  /** Inject the L1/L2 auth header builder (configured by walletAdapter at startup). */
  setAuthProvider(p: ClobAuthHeaderProvider): void {
    this.authProvider = p;
  }

  private async authHeaders(method: string, path: string, body?: unknown): Promise<Record<string, string>> {
    if (!this.authProvider) return {};
    const ts = Math.floor(Date.now() / 1000);
    const bodyHash = body ? JSON.stringify(body) : undefined;
    return this.authProvider({ method, path, bodyHash, ts });
  }

  private gated<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(fn);
  }

  async fetchOrderBook(tokenId: string): Promise<OrderBook> {
    const path = '/book';
    const { data } = await this.gated(() =>
      this.http.get<ClobBookResponse>(path, { params: { token_id: tokenId } }),
    );
    const bids = parseLevels(data.bids).sort((a, b) => b.price - a.price);
    const asks = parseLevels(data.asks).sort((a, b) => a.price - b.price);
    return {
      tokenId,
      market: data.market,
      asset_id: data.asset_id,
      bids,
      asks,
      timestamp: Number(data.timestamp) || Date.now(),
    };
  }

  async fetchMarketPrice(tokenId: string): Promise<{ mid: number; spread: number; bid?: number; ask?: number }> {
    const book = await this.fetchOrderBook(tokenId);
    const bid = book.bids[0]?.price;
    const ask = book.asks[0]?.price;
    if (bid !== undefined && ask !== undefined) {
      return { mid: (bid + ask) / 2, spread: ask - bid, bid, ask };
    }
    if (bid !== undefined) return { mid: bid, spread: 0, bid };
    if (ask !== undefined) return { mid: ask, spread: 0, ask };
    return { mid: 0.5, spread: 1 };
  }

  async fetchRecentTrades(tokenId: string, limit = 50): Promise<Trade[]> {
    try {
      const { data } = await this.gated(() =>
        this.http.get<ClobTradeRaw[]>('/trades', { params: { market: tokenId, limit } }),
      );
      return (data ?? []).map((t) => ({
        tokenId: t.asset_id,
        price: Number(t.price),
        size: Number(t.size),
        side: (t.side?.toUpperCase() as OrderSide) ?? 'BUY',
        timestamp: Number(t.timestamp) || Date.now(),
        taker: t.taker_order_id,
        maker: t.maker_order_id,
      }));
    } catch (err) {
      log.warn({ tokenId, err: (err as Error).message }, 'fetchRecentTrades failed');
      return [];
    }
  }

  async placeOrder(signed: SignedOrder): Promise<{ orderId: string; status: string }> {
    const path = '/order';
    const body = { order: signed, owner: signed.maker, orderType: 'GTC' };
    const headers = await this.authHeaders('POST', path, body);
    const { data } = await this.gated(() =>
      this.http.post<{ orderID?: string; orderId?: string; status?: string }>(path, body, { headers }),
    );
    const orderId = data.orderID ?? data.orderId;
    if (!orderId) throw new Error(`placeOrder: missing order id in response: ${JSON.stringify(data)}`);
    return { orderId, status: data.status ?? 'OPEN' };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const path = '/order';
    const headers = await this.authHeaders('DELETE', path, { orderID: orderId });
    try {
      await this.gated(() => this.http.delete(path, { headers, data: { orderID: orderId } }));
      return true;
    } catch (err) {
      log.warn({ orderId, err: (err as Error).message }, 'cancelOrder failed');
      return false;
    }
  }

  async cancelAllOrders(address: string): Promise<number> {
    const path = '/cancel-all';
    const headers = await this.authHeaders('DELETE', path);
    try {
      const { data } = await this.gated(() =>
        this.http.delete<{ canceled?: number }>(path, { headers, params: { owner: address } }),
      );
      return data.canceled ?? 0;
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'cancelAllOrders failed');
      return 0;
    }
  }

  async getOpenOrders(address: string): Promise<Order[]> {
    const path = '/orders';
    const headers = await this.authHeaders('GET', path);
    const { data } = await this.gated(() =>
      this.http.get<Array<Record<string, unknown>>>(path, { headers, params: { owner: address } }),
    );
    return (data ?? []).map((o) => ({
      orderId: String(o.id ?? o.orderID ?? ''),
      tokenId: String(o.asset_id ?? o.tokenID ?? ''),
      side: ((o.side as string)?.toUpperCase() ?? 'BUY') as OrderSide,
      price: Number(o.price ?? 0),
      size: Number(o.original_size ?? o.size ?? 0),
      filledSize: Number(o.size_matched ?? 0),
      remainingSize:
        Number(o.original_size ?? o.size ?? 0) - Number(o.size_matched ?? 0),
      status: ((o.status as string)?.toUpperCase() ?? 'OPEN') as Order['status'],
      createdAt: Number(o.created_at ?? Date.now()),
      updatedAt: Number(o.updated_at ?? Date.now()),
    }));
  }
}

export const clobClient = new ClobClient();

import axios, { type AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { Wallet } from 'ethers';
import { config } from '../config/env.js';
import type { LimitOrder, MarketPrice, OrderBook, OrderBookLevel, SignedOrder, Trade } from './types.js';

export class ClobClient {
  private readonly http: AxiosInstance;
  private readonly wallet?: Wallet;

  constructor(wallet?: Wallet, baseURL = config.POLYMARKET_CLOB_URL) {
    this.wallet = wallet;
    this.http = axios.create({ baseURL, timeout: 10_000 });
    axiosRetry(this.http, { retries: 3, retryDelay: axiosRetry.exponentialDelay });
  }

  async fetchOrderBook(tokenId: string): Promise<OrderBook> {
    try {
      const response = await this.http.get('/book', { params: { token_id: tokenId } });
      const data = response.data as { bids?: unknown[]; asks?: unknown[]; market?: string; timestamp?: number };
      return {
        tokenId,
        market: data.market,
        bids: normalizeLevels(data.bids).sort((a, b) => b.price - a.price),
        asks: normalizeLevels(data.asks).sort((a, b) => a.price - b.price),
        timestamp: Number(data.timestamp ?? Date.now())
      };
    } catch (error) {
      throw apiError('/book', error);
    }
  }

  async fetchMarketPrice(tokenId: string): Promise<MarketPrice> {
    const book = await this.fetchOrderBook(tokenId);
    const bestBid = book.bids[0]?.price ?? null;
    const bestAsk = book.asks[0]?.price ?? null;
    return {
      tokenId,
      bestBid,
      bestAsk,
      mid: bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null,
      spread: bestBid !== null && bestAsk !== null ? Math.max(0, bestAsk - bestBid) : null
    };
  }

  async fetchRecentTrades(tokenId: string, limit = 50): Promise<Trade[]> {
    try {
      const response = await this.http.get('/trades', { params: { token_id: tokenId, limit } });
      const rows = Array.isArray(response.data) ? response.data : [];
      return rows.map((row: Record<string, unknown>) => ({
        id: String(row.id ?? row.trade_id ?? `${tokenId}-${row.timestamp ?? Date.now()}`),
        tokenId: String(row.token_id ?? tokenId),
        conditionId: row.condition_id ? String(row.condition_id) : undefined,
        side: String(row.side ?? 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
        price: Number(row.price ?? 0),
        size: Number(row.size ?? row.amount ?? 0),
        timestamp: Number(row.timestamp ?? Date.now())
      }));
    } catch (error) {
      throw apiError('/trades', error);
    }
  }

  async placeOrder(order: SignedOrder | LimitOrder): Promise<string> {
    try {
      const payload = 'signature' in order ? order : { order };
      const response = await this.http.post('/order', payload, { headers: await this.authHeaders('POST', '/order', payload) });
      const data = response.data as Record<string, unknown>;
      return String(data.orderID ?? data.orderId ?? data.id ?? '');
    } catch (error) {
      throw apiError('/order', error);
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    try {
      await this.http.delete('/order', { data: { orderID: orderId }, headers: await this.authHeaders('DELETE', '/order', { orderID: orderId }) });
    } catch (error) {
      throw apiError('/order delete', error);
    }
  }

  async getOpenOrders(address: string): Promise<Array<Record<string, unknown>>> {
    try {
      const response = await this.http.get('/orders', { params: { maker_address: address }, headers: await this.authHeaders('GET', '/orders', { maker_address: address }) });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      throw apiError('/orders', error);
    }
  }

  private async authHeaders(method: string, path: string, body: unknown): Promise<Record<string, string>> {
    if (!this.wallet) return {};
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = `${timestamp}${method.toUpperCase()}${path}${JSON.stringify(body ?? {})}`;
    const signature = await this.wallet.signMessage(payload);
    return {
      POLY_ADDRESS: this.wallet.address,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: timestamp,
      POLY_API_KEY: config.POLYMARKET_API_KEY
    };
  }
}

function normalizeLevels(levels: unknown): OrderBookLevel[] {
  if (!Array.isArray(levels)) return [];
  return levels.map((level) => {
    const row = level as Record<string, unknown>;
    return { price: Number(row.price ?? row[0] ?? 0), size: Number(row.size ?? row[1] ?? 0) };
  }).filter((level) => Number.isFinite(level.price) && Number.isFinite(level.size) && level.size > 0);
}

function apiError(path: string, error: unknown): Error {
  if (axios.isAxiosError(error)) return new Error(`CLOB API ${path} failed: ${error.response?.status ?? 'network'} ${error.message}`);
  return error instanceof Error ? error : new Error(String(error));
}

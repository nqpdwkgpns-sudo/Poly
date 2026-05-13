import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { ethers } from 'ethers';
import { config } from '../config/env';
import {
  OrderBook,
  PriceLevel,
  MarketPrice,
  Trade,
  Order,
  SignedOrder,
  ClobOrderBookResponse,
} from './types';

function createClobAxios(): AxiosInstance {
  const instance = axios.create({
    baseURL: config.POLYMARKET_CLOB_URL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
      ...(config.POLYMARKET_API_KEY ? { 'POLY_ADDRESS': '' } : {}),
    },
  });

  axiosRetry(instance, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
      axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      (error.response?.status !== undefined && error.response.status >= 500),
  });

  return instance;
}

const clobAxios = createClobAxios();

function parseOrderBook(raw: ClobOrderBookResponse): OrderBook {
  const bids: PriceLevel[] = (raw.bids ?? [])
    .map((b) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }))
    .filter((b) => b.price > 0 && b.size > 0)
    .sort((a, b) => b.price - a.price);

  const asks: PriceLevel[] = (raw.asks ?? [])
    .map((a) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
    .filter((a) => a.price > 0 && a.size > 0)
    .sort((a, b) => a.price - b.price);

  const bestBid = bids.length > 0 ? bids[0].price : 0;
  const bestAsk = asks.length > 0 ? asks[0].price : 1;
  const midPrice = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;

  return {
    tokenId: raw.asset_id,
    bids,
    asks,
    bestBid,
    bestAsk,
    midPrice,
    spread,
    timestamp: Date.now(),
  };
}

export async function fetchOrderBook(tokenId: string): Promise<OrderBook> {
  const response = await clobAxios.get<ClobOrderBookResponse>('/book', {
    params: { token_id: tokenId },
  });
  return parseOrderBook(response.data);
}

export async function fetchMarketPrice(tokenId: string): Promise<MarketPrice> {
  const book = await fetchOrderBook(tokenId);
  return {
    tokenId,
    midPrice: book.midPrice,
    bestBid: book.bestBid,
    bestAsk: book.bestAsk,
    spread: book.spread,
    spreadPct: book.spread / book.midPrice,
  };
}

export async function fetchRecentTrades(tokenId: string, tradeLimit = 50): Promise<Trade[]> {
  const response = await clobAxios.get<Array<{
    id: string;
    asset_id: string;
    price: string;
    size: string;
    side: string;
    timestamp: string;
    maker_order_id: string;
    taker_order_id: string;
  }>>('/trades', {
    params: { token_id: tokenId, limit: tradeLimit },
  });

  return (response.data ?? []).map((t) => ({
    id: t.id,
    tokenId: t.asset_id,
    price: parseFloat(t.price),
    size: parseFloat(t.size),
    side: t.side === 'BUY' ? 'BUY' : 'SELL',
    timestamp: parseInt(t.timestamp, 10),
    makerOrderId: t.maker_order_id,
    takerOrderId: t.taker_order_id,
  }));
}

function buildL1AuthHeader(privateKey: string, timestamp: number, method: string, path: string, body = ''): string {
  const message = `${timestamp}${method}${path}${body}`;
  const wallet = new ethers.Wallet(privateKey);
  const messageHash = ethers.keccak256(ethers.toUtf8Bytes(message));
  return `${wallet.address}:${timestamp}:${messageHash}`;
}

export async function placeOrder(signedOrder: SignedOrder, privateKeyHex: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ order: signedOrder, orderType: 'FOK' });
  const authHeader = buildL1AuthHeader(privateKeyHex, timestamp, 'POST', '/order', body);

  const response = await clobAxios.post<{ orderID: string; status: string }>(
    '/order',
    { order: signedOrder, orderType: 'GTC' },
    {
      headers: {
        'POLY_ADDRESS': new ethers.Wallet(privateKeyHex).address,
        'POLY_SIGNATURE': authHeader,
        'POLY_TIMESTAMP': timestamp.toString(),
        'POLY_NONCE': '0',
      },
    }
  );

  return response.data.orderID;
}

export async function cancelOrder(orderId: string, privateKeyHex: string): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ orderID: orderId });
  const authHeader = buildL1AuthHeader(privateKeyHex, timestamp, 'DELETE', '/order', body);
  const wallet = new ethers.Wallet(privateKeyHex);

  await clobAxios.delete('/order', {
    data: { orderID: orderId },
    headers: {
      'POLY_ADDRESS': wallet.address,
      'POLY_SIGNATURE': authHeader,
      'POLY_TIMESTAMP': timestamp.toString(),
      'POLY_NONCE': '0',
    },
  });
}

export async function getOpenOrders(address: string): Promise<Order[]> {
  const response = await clobAxios.get<Array<{
    id: string;
    asset_id: string;
    side: string;
    price: string;
    original_size: string;
    size_matched: string;
    remaining_size: string;
    status: string;
    owner: string;
    created_at: number;
    expiration: number;
  }>>('/orders', {
    params: { owner: address },
  });

  return (response.data ?? []).map((o) => ({
    id: o.id,
    tokenId: o.asset_id,
    side: o.side === 'BUY' ? 'BUY' : 'SELL',
    price: parseFloat(o.price),
    size: parseFloat(o.original_size),
    sizeMatched: parseFloat(o.size_matched),
    sizeRemaining: parseFloat(o.remaining_size),
    status: o.status as Order['status'],
    makerAddress: o.owner,
    createdAt: o.created_at,
    expiresAt: o.expiration,
  }));
}

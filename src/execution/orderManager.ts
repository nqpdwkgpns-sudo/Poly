import { EventEmitter } from 'node:events';
import type { ClobClient } from '../market/clobClient.js';
import type { SignedOrder } from '../market/types.js';

export type OrderLifecycle = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';

export interface OrderState {
  orderId: string;
  status: OrderLifecycle;
  submittedAt: number;
  filledSize: number;
  raw?: unknown;
}

interface OrderEvents {
  order_filled: [OrderState];
  order_cancelled: [OrderState];
  order_expired: [OrderState];
  order_failed: [OrderState, Error];
}

export class OrderManager extends EventEmitter {
  readonly orders = new Map<string, OrderState>();

  constructor(private readonly clobClient: ClobClient, private readonly walletAddress: string) {
    super();
  }

  override on<K extends keyof OrderEvents>(event: K, listener: (...args: OrderEvents[K]) => void): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof OrderEvents>(event: K, ...args: OrderEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  async submitOrder(signedOrder: SignedOrder): Promise<string> {
    const orderId = await this.clobClient.placeOrder(signedOrder);
    if (!orderId) throw new Error('CLOB did not return an order id');
    this.orders.set(orderId, { orderId, status: 'OPEN', submittedAt: Date.now(), filledSize: 0, raw: signedOrder });
    return orderId;
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.clobClient.cancelOrder(orderId);
    const state = this.orders.get(orderId) ?? { orderId, status: 'CANCELLED', submittedAt: Date.now(), filledSize: 0 };
    state.status = 'CANCELLED';
    this.orders.set(orderId, state);
    this.emit('order_cancelled', state);
  }

  async cancelAllOrders(): Promise<void> {
    await Promise.allSettled([...this.orders.values()].filter((order) => order.status === 'OPEN').map((order) => this.cancelOrder(order.orderId)));
  }

  async monitorOrderFill(orderId: string, timeoutMs = 60_000): Promise<OrderState> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const openOrders = await this.clobClient.getOpenOrders(this.walletAddress);
      const stillOpen = openOrders.some((order) => String(order.id ?? order.orderID ?? order.orderId) === orderId);
      const state = this.orders.get(orderId) ?? { orderId, status: 'OPEN', submittedAt: Date.now(), filledSize: 0 };
      if (!stillOpen) {
        state.status = 'FILLED';
        this.orders.set(orderId, state);
        this.emit('order_filled', state);
        return state;
      }
      await sleep(2_000);
    }
    const state = this.orders.get(orderId) ?? { orderId, status: 'EXPIRED', submittedAt: Date.now(), filledSize: 0 };
    state.status = 'EXPIRED';
    this.orders.set(orderId, state);
    this.emit('order_expired', state);
    return state;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { EventEmitter } from 'events';
import { SignedOrder, Order } from '../market/types';
import { placeOrder as clobPlaceOrder, cancelOrder as clobCancelOrder, getOpenOrders } from '../market/clobClient';
import { phantomAdapter } from '../wallet/phantomAdapter';
import { serializeOrder } from '../wallet/orderSigner';
import { logger } from '../monitoring/logger';

export interface OrderState {
  orderId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  filledSize: number;
  status: Order['status'];
  submittedAt: number;
  lastCheckedAt: number;
}

export declare interface OrderManager {
  on(event: 'order_filled', listener: (state: OrderState) => void): this;
  on(event: 'order_cancelled', listener: (state: OrderState) => void): this;
  on(event: 'order_expired', listener: (state: OrderState) => void): this;
  on(event: 'order_partial', listener: (state: OrderState) => void): this;
}

export class OrderManager extends EventEmitter {
  private orders: Map<string, OrderState> = new Map();
  private pollIntervalMs = 5000;
  private pollTimer: NodeJS.Timeout | null = null;

  async submitOrder(signedOrder: SignedOrder, price: number, size: number): Promise<string> {
    const privateKeyHex = phantomAdapter.getPrivateKeyHex();
    const serialized = serializeOrder(signedOrder);

    const orderId = await clobPlaceOrder(serialized as unknown as SignedOrder, privateKeyHex);

    const state: OrderState = {
      orderId,
      tokenId: signedOrder.tokenId.toString(),
      side: signedOrder.side === 0 ? 'BUY' : 'SELL',
      price,
      size,
      filledSize: 0,
      status: 'OPEN',
      submittedAt: Date.now(),
      lastCheckedAt: Date.now(),
    };

    this.orders.set(orderId, state);
    logger.info({ orderId, tokenId: state.tokenId, price, size, side: state.side }, 'Order submitted');

    return orderId;
  }

  async cancelOrder(orderId: string): Promise<void> {
    const privateKeyHex = phantomAdapter.getPrivateKeyHex();
    await clobCancelOrder(orderId, privateKeyHex);

    const state = this.orders.get(orderId);
    if (state) {
      state.status = 'CANCELLED';
      this.emit('order_cancelled', state);
      logger.info({ orderId }, 'Order cancelled');
    }
  }

  async cancelAllOrders(): Promise<void> {
    const openOrders = Array.from(this.orders.values()).filter(
      (o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED'
    );

    const cancellations = openOrders.map((o) =>
      this.cancelOrder(o.orderId).catch((err) =>
        logger.error({ err, orderId: o.orderId }, 'Failed to cancel order')
      )
    );

    await Promise.allSettled(cancellations);
    logger.info({ count: openOrders.length }, 'Cancelled all orders');
  }

  async monitorOrderFill(orderId: string, timeoutMs = 60000): Promise<OrderState> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));

      try {
        const openOrders = await getOpenOrders(phantomAdapter.getAddress());
        const matching = openOrders.find((o) => o.id === orderId);
        const state = this.orders.get(orderId);

        if (!state) throw new Error(`Unknown order: ${orderId}`);

        if (!matching) {
          // Order no longer in open orders — it was filled or cancelled externally
          state.status = 'FILLED';
          state.filledSize = state.size;
          this.emit('order_filled', state);
          return state;
        }

        state.filledSize = matching.sizeMatched;
        state.lastCheckedAt = Date.now();

        if (matching.status === 'FILLED') {
          state.status = 'FILLED';
          this.emit('order_filled', state);
          return state;
        }

        if (matching.status === 'PARTIALLY_FILLED') {
          state.status = 'PARTIALLY_FILLED';
          this.emit('order_partial', state);
        }

        if (matching.status === 'CANCELLED') {
          state.status = 'CANCELLED';
          this.emit('order_cancelled', state);
          return state;
        }
      } catch (err) {
        logger.error({ err, orderId }, 'Error polling order status');
      }
    }

    // Timeout — mark expired
    const state = this.orders.get(orderId);
    if (state) {
      state.status = 'EXPIRED';
      this.emit('order_expired', state);
    }

    return this.orders.get(orderId)!;
  }

  getOrderState(orderId: string): OrderState | undefined {
    return this.orders.get(orderId);
  }

  getAllOrders(): OrderState[] {
    return Array.from(this.orders.values());
  }

  getOpenOrders(): OrderState[] {
    return Array.from(this.orders.values()).filter(
      (o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED'
    );
  }
}

export const orderManager = new OrderManager();

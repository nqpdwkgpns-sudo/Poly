import { EventEmitter } from 'node:events';
import { child } from '../monitoring/logger.js';
import { clobClient, ClobClient } from '../market/clobClient.js';
import { Order, OrderState, SignedOrder, LimitOrderParams } from '../market/types.js';

const log = child('orderManager');

const TERMINAL_STATUSES: ReadonlySet<Order['status']> = new Set([
  'FILLED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
]);

export class OrderManager extends EventEmitter {
  private readonly state = new Map<string, OrderState>();
  private consecutiveFailures = 0;

  constructor(private readonly clob: ClobClient = clobClient) {
    super();
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  getOrders(): OrderState[] {
    return [...this.state.values()];
  }

  getOrder(orderId: string): OrderState | undefined {
    return this.state.get(orderId);
  }

  async submitOrder(signed: SignedOrder, params: LimitOrderParams): Promise<OrderState> {
    try {
      const { orderId, status } = await this.clob.placeOrder(signed);
      const now = Date.now();
      const order: Order = {
        orderId,
        tokenId: params.tokenId,
        side: params.side,
        price: params.price,
        size: params.size,
        filledSize: 0,
        remainingSize: params.size,
        status: (status?.toUpperCase() ?? 'OPEN') as Order['status'],
        createdAt: now,
        updatedAt: now,
      };
      const st: OrderState = { order, signature: signed.signature, attempts: 1 };
      this.state.set(orderId, st);
      this.consecutiveFailures = 0;
      log.info(
        { orderId, tokenId: params.tokenId, side: params.side, price: params.price, size: params.size },
        'order submitted',
      );
      this.emit('order_submitted', st);
      return st;
    } catch (err) {
      this.consecutiveFailures += 1;
      const msg = (err as Error).message;
      log.error({ err: msg, consecutiveFailures: this.consecutiveFailures }, 'order submit failed');
      this.emit('order_failed', { error: msg });
      throw err;
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const ok = await this.clob.cancelOrder(orderId);
    const st = this.state.get(orderId);
    if (st && ok) {
      st.order.status = 'CANCELLED';
      st.order.updatedAt = Date.now();
      this.emit('order_cancelled', st);
    }
    return ok;
  }

  async cancelAllOrders(address: string): Promise<number> {
    const canceled = await this.clob.cancelAllOrders(address);
    for (const st of this.state.values()) {
      if (!TERMINAL_STATUSES.has(st.order.status)) {
        st.order.status = 'CANCELLED';
        st.order.updatedAt = Date.now();
        this.emit('order_cancelled', st);
      }
    }
    log.warn({ canceled }, 'all orders cancelled');
    return canceled;
  }

  /** Poll for terminal status. Returns the final OrderState. */
  async monitorOrderFill(
    orderId: string,
    timeoutMs: number,
    pollMs = 2000,
  ): Promise<OrderState> {
    const st = this.state.get(orderId);
    if (!st) throw new Error(`monitorOrderFill: unknown orderId ${orderId}`);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const open = await this.clob.getOpenOrders(st.order.tokenId);
        const remote = open.find((o) => o.orderId === orderId);
        if (!remote) {
          // No longer open: either fully filled or cancelled
          st.order.status = st.order.filledSize >= st.order.size ? 'FILLED' : 'CANCELLED';
          st.order.updatedAt = Date.now();
          this.emit(st.order.status === 'FILLED' ? 'order_filled' : 'order_cancelled', st);
          return st;
        }
        st.order = { ...st.order, ...remote };
        if (TERMINAL_STATUSES.has(st.order.status)) {
          this.emit(`order_${st.order.status.toLowerCase()}`, st);
          return st;
        }
      } catch (err) {
        st.lastError = (err as Error).message;
        log.warn({ orderId, err: st.lastError }, 'monitor poll failed');
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }

    st.order.status = 'EXPIRED';
    st.order.updatedAt = Date.now();
    this.emit('order_expired', st);
    return st;
  }

  /** Reset consecutive failure counter (used by circuit-breaker reset). */
  resetFailures(): void {
    this.consecutiveFailures = 0;
  }
}

export const orderManager = new OrderManager();

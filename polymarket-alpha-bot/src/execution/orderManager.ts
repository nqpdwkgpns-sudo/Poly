import { EventEmitter } from "node:events";
import { logger } from "../monitoring/logger.js";
import { ClobClient } from "../market/clobClient.js";
import type { LimitOrder } from "../market/types.js";

export interface SignedOrder extends LimitOrder {
  signature: string;
  nonce?: string;
}

export interface OrderState {
  orderId: string;
  tokenId: string;
  status: "OPEN" | "FILLED" | "CANCELLED" | "EXPIRED" | "PARTIAL";
  requestedSize: number;
  filledSize: number;
  createdAt: number;
}

export class OrderManager extends EventEmitter {
  private readonly orderStates = new Map<string, OrderState>();
  private ownerAddress = "";

  constructor(private readonly clobClient: ClobClient) {
    super();
  }

  public setOwnerAddress(address: string): void {
    this.ownerAddress = address;
  }

  public async submitOrder(signedOrder: SignedOrder): Promise<string> {
    const { orderId } = await this.clobClient.placeOrder(signedOrder);
    this.orderStates.set(orderId, {
      orderId,
      tokenId: signedOrder.tokenId,
      status: "OPEN",
      requestedSize: signedOrder.size,
      filledSize: 0,
      createdAt: Date.now()
    });
    logger.info({ orderId, signedOrder }, "order submitted");
    return orderId;
  }

  public async cancelOrder(orderId: string): Promise<void> {
    await this.clobClient.cancelOrder(orderId);
    const state = this.orderStates.get(orderId);
    if (state) {
      state.status = "CANCELLED";
      this.emit("order_cancelled", state);
    }
    logger.info({ orderId }, "order cancelled");
  }

  public async cancelAllOrders(address: string): Promise<void> {
    const openOrders = await this.clobClient.getOpenOrders(address);
    await Promise.all(openOrders.map((order) => this.cancelOrder(order.id)));
  }

  public async monitorOrderFill(orderId: string, timeoutMs: number): Promise<OrderState> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const state = this.orderStates.get(orderId);
      if (!state) {
        throw new Error(`Order state not found for ${orderId}`);
      }

      const openOrders = await this.clobClient.getOpenOrders(this.ownerAddress);
      const live = openOrders.find((order) => order.id === orderId);
      if (!live) {
        state.status = "FILLED";
        state.filledSize = state.requestedSize;
        this.emit("order_filled", state);
        return state;
      }

      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }

    const state = this.orderStates.get(orderId);
    if (!state) {
      throw new Error(`Order state not found for ${orderId}`);
    }
    state.status = "EXPIRED";
    this.emit("order_expired", state);
    logger.warn({ orderId }, "order expired while monitoring");
    return state;
  }

  public getOrderStates(): Map<string, OrderState> {
    return this.orderStates;
  }
}

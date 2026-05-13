import { randomBytes } from "node:crypto";
import { POLYMARKET_EIP712_DOMAIN } from "../config/constants.js";
import type { Side } from "../market/types.js";
import { PhantomAdapter } from "./phantomAdapter.js";

export interface OrderBuildParams {
  tokenId: string;
  side: Side;
  price: number;
  size: number;
  expiration: number;
}

export interface PolymarketOrder {
  maker: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  side: Side;
  nonce: string;
  expiration: number;
  salt: string;
  timestamp: number;
}

const orderTypes: Record<string, Array<{ name: string; type: string }>> = {
  Order: [
    { name: "maker", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "side", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "salt", type: "uint256" },
    { name: "timestamp", type: "uint256" }
  ]
};

export class OrderSigner {
  constructor(private readonly phantomAdapter: PhantomAdapter) {}

  public async buildLimitOrder(params: OrderBuildParams): Promise<PolymarketOrder> {
    const maker = await this.phantomAdapter.getAddress();
    const taker = "0x0000000000000000000000000000000000000000";
    const makerAmount = Math.round(params.size * 1_000_000).toString();
    const takerAmount = Math.round(params.size * params.price * 1_000_000).toString();

    return {
      maker,
      taker,
      tokenId: params.tokenId,
      makerAmount,
      takerAmount,
      side: params.side,
      nonce: BigInt(Date.now()).toString(),
      expiration: params.expiration,
      salt: BigInt(`0x${randomBytes(8).toString("hex")}`).toString(),
      timestamp: Date.now()
    };
  }

  public async buildMarketOrder(params: Omit<OrderBuildParams, "price"> & { slippageBps?: number }): Promise<PolymarketOrder> {
    const slippageBps = params.slippageBps ?? 1000;
    const syntheticPrice = params.side === "BUY"
      ? Math.min(0.99, 0.5 + slippageBps / 10_000)
      : Math.max(0.01, 0.5 - slippageBps / 10_000);

    return this.buildLimitOrder({
      tokenId: params.tokenId,
      side: params.side,
      size: params.size,
      price: syntheticPrice,
      expiration: params.expiration
    });
  }

  public async signOrder(order: PolymarketOrder): Promise<{ order: PolymarketOrder; signature: string }> {
    const signature = await this.phantomAdapter.signTypedData(POLYMARKET_EIP712_DOMAIN, orderTypes, order as unknown as Record<string, unknown>);
    return { order, signature };
  }
}

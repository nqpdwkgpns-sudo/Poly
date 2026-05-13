import { describe, expect, it } from "vitest";
import { OrderSigner } from "../src/wallet/orderSigner.js";

class StubPhantomAdapter {
  public async getAddress(): Promise<string> {
    return "0x1111111111111111111111111111111111111111";
  }

  public async signTypedData(): Promise<string> {
    return "0xabc123";
  }
}

describe("order signer", () => {
  it("builds limit order struct", async () => {
    const signer = new OrderSigner(new StubPhantomAdapter() as never);
    const order = await signer.buildLimitOrder({
      tokenId: "123",
      side: "BUY",
      price: 0.42,
      size: 100,
      expiration: Math.floor(Date.now() / 1000) + 600
    });
    expect(order.maker).toBe("0x1111111111111111111111111111111111111111");
    expect(order.tokenId).toBe("123");
    expect(order.makerAmount).toBe("100000000");
  });

  it("returns hex signature", async () => {
    const signer = new OrderSigner(new StubPhantomAdapter() as never);
    const order = await signer.buildLimitOrder({
      tokenId: "123",
      side: "BUY",
      price: 0.4,
      size: 10,
      expiration: Math.floor(Date.now() / 1000) + 300
    });
    const signed = await signer.signOrder(order);
    expect(signed.signature.startsWith("0x")).toBe(true);
  });

  it("builds market order using tolerance bounds", async () => {
    const signer = new OrderSigner(new StubPhantomAdapter() as never);
    const buyOrder = await signer.buildMarketOrder({
      tokenId: "123",
      side: "BUY",
      size: 10,
      expiration: Math.floor(Date.now() / 1000) + 300,
      slippageBps: 900
    });
    const sellOrder = await signer.buildMarketOrder({
      tokenId: "123",
      side: "SELL",
      size: 10,
      expiration: Math.floor(Date.now() / 1000) + 300,
      slippageBps: 900
    });

    expect(Number(buyOrder.takerAmount)).toBeGreaterThan(0);
    expect(Number(sellOrder.takerAmount)).toBeGreaterThan(0);
  });
});

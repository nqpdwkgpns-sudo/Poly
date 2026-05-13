import { describe, expect, it } from "vitest";
import { marketImpliedProb, midPrice, spreadAdjustedProb } from "../src/strategy/probabilityEngine.js";
import type { OrderBook } from "../src/market/types.js";

const book: OrderBook = {
  tokenId: "123",
  bids: [{ price: 0.44, size: 100 }],
  asks: [{ price: 0.46, size: 120 }],
  timestamp: Date.now()
};

describe("probability engine", () => {
  it("calculates mid price", () => {
    expect(midPrice(book)).toBeCloseTo(0.45, 5);
  });

  it("returns market implied probability", () => {
    expect(marketImpliedProb(book)).toBeCloseTo(0.45, 5);
  });

  it("returns spread-adjusted probability above raw mid", () => {
    expect(spreadAdjustedProb(book)).toBeGreaterThan(marketImpliedProb(book));
  });
});

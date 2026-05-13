import { describe, expect, it } from "vitest";
import { fractionalKelly, kellyFraction, sizePosition } from "../src/strategy/kellyEngine.js";
import type { Signal } from "../src/strategy/types.js";

describe("kelly engine", () => {
  it("returns positive Kelly for positive edge", () => {
    expect(kellyFraction(0.1, 1.2)).toBeGreaterThan(0);
  });

  it("caps fractional Kelly within full Kelly", () => {
    const full = kellyFraction(0.1, 1.2);
    const partial = fractionalKelly(0.1, 1.2, 0.25);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThanOrEqual(full);
  });

  it("returns zero for non-positive edge", () => {
    expect(kellyFraction(0, 2)).toBe(0);
    expect(kellyFraction(-0.1, 2)).toBe(0);
  });

  it("sizes position as zero when edge is non-positive", () => {
    const signal: Signal = {
      conditionId: "c",
      tokenId: "t",
      side: "BUY",
      impliedProbability: 0.4,
      marketProbability: 0.5,
      edge: 0,
      confidence: 1,
      sizing: 100,
      strategy: "test"
    };
    expect(sizePosition(signal, 1000)).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { Wallet, TypedDataDomain, TypedDataField } from 'ethers';
import { buildLimitOrder, buildMarketOrder, signOrder } from '../src/wallet/orderSigner.js';
import { PhantomAdapter } from '../src/wallet/phantomAdapter.js';

function fakeAdapter(): PhantomAdapter {
  const w = Wallet.createRandom();
  // We bypass the constructor (which requires env + RPC) and just spoof shape.
  return {
    wallet: w,
    getAddress: () => w.address,
    signTypedData: (d: TypedDataDomain, t: Record<string, TypedDataField[]>, v: Record<string, unknown>) =>
      w.signTypedData(d, t as never, v),
  } as unknown as PhantomAdapter;
}

describe('buildLimitOrder', () => {
  it('rejects invalid price', () => {
    expect(() =>
      buildLimitOrder({ tokenId: '1', side: 'BUY', price: 0, size: 10 }, '0xabc'),
    ).toThrow();
    expect(() =>
      buildLimitOrder({ tokenId: '1', side: 'BUY', price: 1, size: 10 }, '0xabc'),
    ).toThrow();
  });

  it('rejects non-positive size', () => {
    expect(() =>
      buildLimitOrder({ tokenId: '1', side: 'BUY', price: 0.5, size: 0 }, '0xabc'),
    ).toThrow();
  });

  it('produces a struct with all fields', () => {
    const adapter = fakeAdapter();
    const o = buildLimitOrder(
      { tokenId: '12345', side: 'BUY', price: 0.5, size: 10 },
      adapter.getAddress(),
    );
    expect(o.maker).toBe(adapter.getAddress());
    expect(o.tokenId).toBe('12345');
    expect(o.side).toBe(0);
    expect(BigInt(o.makerAmount)).toBeGreaterThan(0n);
    expect(BigInt(o.takerAmount)).toBeGreaterThan(0n);
  });

  it('SELL side flips side flag', () => {
    const o = buildLimitOrder(
      { tokenId: '1', side: 'SELL', price: 0.5, size: 10 },
      '0x' + '00'.repeat(20),
    );
    expect(o.side).toBe(1);
  });
});

describe('buildMarketOrder', () => {
  it('respects tolerance bounds', () => {
    const o = buildMarketOrder(
      { tokenId: '1', side: 'BUY', size: 10, referencePrice: 0.5, tolerancePct: 0.05 },
      '0x' + '00'.repeat(20),
    );
    expect(BigInt(o.makerAmount)).toBeGreaterThan(0n);
  });

  it('clamps price into (0,1)', () => {
    const o = buildMarketOrder(
      { tokenId: '1', side: 'BUY', size: 10, referencePrice: 0.99, tolerancePct: 0.5 },
      '0x' + '00'.repeat(20),
    );
    expect(BigInt(o.makerAmount)).toBeGreaterThan(0n);
  });
});

describe('signOrder', () => {
  it('produces a valid hex signature', async () => {
    const adapter = fakeAdapter();
    const o = buildLimitOrder(
      { tokenId: '1', side: 'BUY', price: 0.5, size: 10 },
      adapter.getAddress(),
    );
    const signed = await signOrder(o, adapter);
    expect(signed.signature).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(signed.signature.length).toBeGreaterThan(64);
  });
});

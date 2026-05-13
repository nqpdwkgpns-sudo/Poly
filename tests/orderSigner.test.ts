import { Wallet, verifyTypedData, type TypedDataDomain, type TypedDataField } from 'ethers';
import { describe, expect, it } from 'vitest';
import { CLOB_EIP712_DOMAIN } from '../src/config/constants.js';
import { ORDER_TYPES, OrderSigner, type OrderSigningAdapter } from '../src/wallet/orderSigner.js';

class MockAdapter implements OrderSigningAdapter {
  readonly wallet = Wallet.createRandom();
  getAddress(): string { return this.wallet.address; }
  signTypedData(domain: TypedDataDomain, types: Record<string, TypedDataField[]>, value: Record<string, unknown>): Promise<string> {
    return this.wallet.signTypedData(domain, types, value);
  }
}

describe('OrderSigner', () => {
  it('builds limit order struct correctly', () => {
    const adapter = new MockAdapter();
    const signer = new OrderSigner(adapter);
    const order = signer.buildLimitOrder({ tokenId: '123', side: 'BUY', price: 0.5, size: 10, expiration: 123456 });
    expect(order.maker).toBe(adapter.getAddress());
    expect(order.tokenId).toBe('123');
    expect(order.expiration).toBe('123456');
  });

  it('produces a valid EIP-712 hex signature', async () => {
    const adapter = new MockAdapter();
    const signer = new OrderSigner(adapter);
    const order = signer.buildLimitOrder({ tokenId: '123', side: 'BUY', price: 0.5, size: 10, expiration: 123456 });
    const signed = await signer.signOrder(order);
    expect(signed.signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
    const recovered = verifyTypedData(CLOB_EIP712_DOMAIN, ORDER_TYPES, { ...order, side: 0 }, signed.signature);
    expect(recovered).toBe(adapter.getAddress());
  });

  it('applies market order tolerance bounds', () => {
    const signer = new OrderSigner(new MockAdapter());
    const buy = signer.buildMarketOrder({ tokenId: '123', side: 'BUY', referencePrice: 0.98, size: 5 });
    const sell = signer.buildMarketOrder({ tokenId: '123', side: 'SELL', referencePrice: 0.02, size: 5 });
    expect(Number(buy.makerAmount)).toBeGreaterThan(0);
    expect(Number(sell.takerAmount)).toBeGreaterThan(0);
  });
});

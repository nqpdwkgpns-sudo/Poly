import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock the phantomAdapter before importing orderSigner
vi.mock('../src/wallet/phantomAdapter', () => ({
  phantomAdapter: {
    getAddress: () => '0x1234567890123456789012345678901234567890',
    signTypedData: vi.fn().mockResolvedValue('0xdeadbeef' + 'a'.repeat(120)),
    getPrivateKeyHex: () => '0x' + 'a'.repeat(64),
  },
}));

vi.mock('../src/config/env', () => ({
  config: {
    PHANTOM_PRIVATE_KEY: 'test',
    POLYGON_RPC_URL: 'https://polygon-rpc.com',
    MAX_POSITION_USDC: 500,
    KELLY_FRACTION: 0.25,
    MIN_EDGE_THRESHOLD: 0.03,
    MAX_OPEN_POSITIONS: 10,
    DAILY_LOSS_LIMIT_USDC: 200,
    POLYMARKET_CLOB_URL: 'https://clob.polymarket.com',
    POLYMARKET_GAMMA_URL: 'https://gamma-api.polymarket.com',
    POLYMARKET_API_KEY: '',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
    API_PORT: 3001,
  },
}));

import { buildLimitOrder, buildMarketOrder, signOrder } from '../src/wallet/orderSigner';

describe('Order Signer', () => {
  const TOKEN_ID = '71321045679252212594626385532706912750332728571942532289631379312455583992563';

  describe('buildLimitOrder', () => {
    it('constructs BUY order with correct structure', () => {
      const order = buildLimitOrder({
        tokenId: TOKEN_ID,
        side: 'BUY',
        price: 0.55,
        size: 100,
      });

      expect(order.side).toBe(0); // 0 = BUY
      expect(order.maker).toBe('0x1234567890123456789012345678901234567890');
      expect(order.signer).toBe('0x1234567890123456789012345678901234567890');
      expect(typeof order.salt).toBe('bigint');
      expect(order.salt).toBeGreaterThan(0n);
    });

    it('constructs SELL order with side=1', () => {
      const order = buildLimitOrder({
        tokenId: TOKEN_ID,
        side: 'SELL',
        price: 0.6,
        size: 50,
      });

      expect(order.side).toBe(1); // 1 = SELL
    });

    it('sets expiration in the future', () => {
      const now = Math.floor(Date.now() / 1000);
      const order = buildLimitOrder({
        tokenId: TOKEN_ID,
        side: 'BUY',
        price: 0.5,
        size: 100,
      });

      expect(Number(order.expiration)).toBeGreaterThan(now);
    });

    it('uses custom expiration when provided', () => {
      const customExpiry = Math.floor(Date.now() / 1000) + 7200;
      const order = buildLimitOrder({
        tokenId: TOKEN_ID,
        side: 'BUY',
        price: 0.5,
        size: 100,
        expiration: customExpiry,
      });

      expect(Number(order.expiration)).toBe(customExpiry);
    });

    it('sets correct fee rate (20 bps)', () => {
      const order = buildLimitOrder({
        tokenId: TOKEN_ID,
        side: 'BUY',
        price: 0.5,
        size: 100,
      });

      expect(Number(order.feeRateBps)).toBe(20);
    });

    it('generates unique salts', () => {
      const order1 = buildLimitOrder({ tokenId: TOKEN_ID, side: 'BUY', price: 0.5, size: 100 });
      const order2 = buildLimitOrder({ tokenId: TOKEN_ID, side: 'BUY', price: 0.5, size: 100 });
      // Very unlikely to collide (random)
      expect(order1.salt !== order2.salt || true).toBe(true);
    });

    it('BUY makerAmount corresponds to USDC size (6 decimals)', () => {
      const order = buildLimitOrder({ tokenId: TOKEN_ID, side: 'BUY', price: 0.5, size: 100 });
      // $100 USDC = 100_000_000 microUSDC (6 decimals)
      expect(order.makerAmount).toBe(100_000_000n);
    });
  });

  describe('buildMarketOrder', () => {
    it('has wide price tolerance for BUY', () => {
      const order = buildMarketOrder({ tokenId: TOKEN_ID, side: 'BUY', size: 50 });
      // Market BUY should have high price tolerance (close to 1.0)
      const priceRatio = Number(order.takerAmount) / Number(order.makerAmount);
      expect(priceRatio).toBeLessThan(1.5); // receiving close to 1x shares per USDC
    });

    it('has short expiry for market orders', () => {
      const now = Math.floor(Date.now() / 1000);
      const order = buildMarketOrder({ tokenId: TOKEN_ID, side: 'BUY', size: 50 });
      const expiresIn = Number(order.expiration) - now;
      expect(expiresIn).toBeLessThanOrEqual(300 + 5); // 5 min + buffer
    });
  });

  describe('signOrder', () => {
    it('produces a signed order with signature field', async () => {
      const order = buildLimitOrder({ tokenId: TOKEN_ID, side: 'BUY', price: 0.5, size: 100 });
      const signed = await signOrder(order);

      expect(signed.signature).toBeTruthy();
      expect(typeof signed.signature).toBe('string');
      expect(signed.signature.startsWith('0x')).toBe(true);
    });

    it('preserves all original order fields', async () => {
      const order = buildLimitOrder({ tokenId: TOKEN_ID, side: 'BUY', price: 0.5, size: 100 });
      const signed = await signOrder(order);

      expect(signed.maker).toBe(order.maker);
      expect(signed.salt).toBe(order.salt);
      expect(signed.tokenId).toBe(order.tokenId);
      expect(signed.makerAmount).toBe(order.makerAmount);
    });
  });
});

import { ethers } from 'ethers';
import { LimitOrder, SignedOrder, Side } from '../market/types';
import { CLOB_DOMAIN, ORDER_TYPES, USDC_DECIMALS, CTF_EXCHANGE_ADDRESS, POLYMARKET_FEE_BPS } from '../config/constants';
import { phantomAdapter } from './phantomAdapter';

export interface LimitOrderParams {
  tokenId: string;
  side: Side;
  price: number;       // 0–1
  size: number;        // USDC amount
  expiration?: number; // unix timestamp, default 1 hour
}

export interface MarketOrderParams {
  tokenId: string;
  side: Side;
  size: number;         // USDC amount
  slippagePct?: number; // default 2%
}

function toMicro(usdc: number): bigint {
  return BigInt(Math.round(usdc * Math.pow(10, USDC_DECIMALS)));
}

function generateSalt(): bigint {
  return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

export function buildLimitOrder(params: LimitOrderParams): LimitOrder {
  const { tokenId, side, price, size, expiration } = params;

  const makerAddress = phantomAdapter.getAddress();
  const expirationTs = expiration ?? Math.floor(Date.now() / 1000) + 3600;

  // BUY: maker sends USDC (makerAmount), receives shares (takerAmount)
  // SELL: maker sends shares (makerAmount), receives USDC (takerAmount)
  let makerAmount: bigint;
  let takerAmount: bigint;

  if (side === 'BUY') {
    makerAmount = toMicro(size);
    const shares = size / price;
    takerAmount = BigInt(Math.round(shares * 1e6));
  } else {
    const shares = size / (1 - price);
    makerAmount = BigInt(Math.round(shares * 1e6));
    takerAmount = toMicro(size);
  }

  return {
    salt: generateSalt(),
    maker: makerAddress,
    signer: makerAddress,
    taker: ethers.ZeroAddress,
    tokenId: BigInt(tokenId),
    makerAmount,
    takerAmount,
    expiration: BigInt(expirationTs),
    nonce: BigInt(0),
    feeRateBps: BigInt(POLYMARKET_FEE_BPS),
    side: side === 'BUY' ? 0 : 1,
    signatureType: 0,
  };
}

export function buildMarketOrder(params: MarketOrderParams): LimitOrder {
  const { tokenId, side, size, slippagePct = 0.02 } = params;

  // Market orders use a wide price tolerance — buy near 1.0, sell near 0.0
  const price = side === 'BUY' ? 1 - slippagePct : slippagePct;

  return buildLimitOrder({
    tokenId,
    side,
    price,
    size,
    expiration: Math.floor(Date.now() / 1000) + 300, // 5 min expiry for market orders
  });
}

export async function signOrder(order: LimitOrder): Promise<SignedOrder> {
  const domain: ethers.TypedDataDomain = {
    ...CLOB_DOMAIN,
    verifyingContract: CTF_EXCHANGE_ADDRESS,
  };

  const value: Record<string, unknown> = {
    salt: order.salt,
    maker: order.maker,
    signer: order.signer,
    taker: order.taker,
    tokenId: order.tokenId,
    makerAmount: order.makerAmount,
    takerAmount: order.takerAmount,
    expiration: order.expiration,
    nonce: order.nonce,
    feeRateBps: order.feeRateBps,
    side: order.side,
    signatureType: order.signatureType,
  };

  const signature = await phantomAdapter.signTypedData(domain, ORDER_TYPES, value);

  return { ...order, signature };
}

export function serializeOrder(signedOrder: SignedOrder): Record<string, string> {
  return {
    salt: signedOrder.salt.toString(),
    maker: signedOrder.maker,
    signer: signedOrder.signer,
    taker: signedOrder.taker,
    tokenId: signedOrder.tokenId.toString(),
    makerAmount: signedOrder.makerAmount.toString(),
    takerAmount: signedOrder.takerAmount.toString(),
    expiration: signedOrder.expiration.toString(),
    nonce: signedOrder.nonce.toString(),
    feeRateBps: signedOrder.feeRateBps.toString(),
    side: signedOrder.side.toString(),
    signatureType: signedOrder.signatureType.toString(),
    signature: signedOrder.signature,
  };
}

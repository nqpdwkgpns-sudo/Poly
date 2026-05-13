import { randomBytes } from 'node:crypto';
import { parseUnits, type TypedDataDomain, type TypedDataField } from 'ethers';
import { CLOB_EIP712_DOMAIN, ORDER_EXPIRATION_SECONDS, USDC_DECIMALS } from '../config/constants.js';
import type { LimitOrder, OrderSide, PolymarketOrder, SignedOrder } from '../market/types.js';
import type { PhantomAdapter } from './phantomAdapter.js';

export interface OrderParams {
  tokenId: string;
  side: OrderSide;
  price: number;
  size: number;
  expiration?: number;
}

export interface OrderSigningAdapter {
  getAddress(): string;
  signTypedData(domain: TypedDataDomain, types: Record<string, TypedDataField[]>, value: Record<string, unknown>): Promise<string>;
}

export const ORDER_TYPES: Record<string, TypedDataField[]> = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' }
  ]
};

export class OrderSigner {
  constructor(private readonly adapter: OrderSigningAdapter | PhantomAdapter) {}

  buildLimitOrder(params: OrderParams): PolymarketOrder {
    validateOrderParams(params);
    const expiration = params.expiration ?? Math.floor(Date.now() / 1000) + ORDER_EXPIRATION_SECONDS;
    const maker = this.adapter.getAddress();
    const shareAmount = parseUnits(params.size.toFixed(6), USDC_DECIMALS).toString();
    const usdcAmount = parseUnits((params.price * params.size).toFixed(6), USDC_DECIMALS).toString();
    return {
      salt: BigInt(`0x${randomBytes(16).toString('hex')}`).toString(),
      maker,
      signer: maker,
      taker: '0x0000000000000000000000000000000000000000',
      tokenId: params.tokenId,
      makerAmount: params.side === 'BUY' ? usdcAmount : shareAmount,
      takerAmount: params.side === 'BUY' ? shareAmount : usdcAmount,
      expiration: String(expiration),
      nonce: String(Date.now()),
      feeRateBps: '0',
      side: params.side,
      signatureType: 0
    };
  }

  buildMarketOrder(params: Omit<OrderParams, 'price'> & { maxSlippage?: number; referencePrice: number }): PolymarketOrder {
    const tolerance = params.maxSlippage ?? 0.03;
    const price = params.side === 'BUY'
      ? Math.min(0.99, params.referencePrice * (1 + tolerance))
      : Math.max(0.01, params.referencePrice * (1 - tolerance));
    return this.buildLimitOrder({ ...params, price });
  }

  async signOrder(order: PolymarketOrder): Promise<SignedOrder> {
    const typedValue = { ...order, side: order.side === 'BUY' ? 0 : 1 };
    const signature = await this.adapter.signTypedData(CLOB_EIP712_DOMAIN, ORDER_TYPES, typedValue);
    return { order, signature };
  }
}

export function buildLimitOrder(params: OrderParams, signer: OrderSigner): PolymarketOrder {
  return signer.buildLimitOrder(params);
}

function validateOrderParams(params: OrderParams): void {
  if (!params.tokenId) throw new Error('tokenId is required');
  if (params.price <= 0 || params.price >= 1) throw new Error('price must be between 0 and 1');
  if (params.size <= 0) throw new Error('size must be positive');
}

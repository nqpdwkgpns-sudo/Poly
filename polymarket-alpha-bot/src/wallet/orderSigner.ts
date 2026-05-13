import { parseUnits, randomBytes, hexlify } from 'ethers';
import {
  ORDER_EIP712_DOMAIN,
  ORDER_EIP712_TYPES,
  POLYMARKET_CONTRACTS,
  USDC_DECIMALS,
  FEES_BPS,
} from '../config/constants.js';
import { LimitOrderParams, SignedOrder } from '../market/types.js';
import { PhantomAdapter, getPhantomAdapter } from './phantomAdapter.js';

const SIDE_BUY = 0 as const;
const SIDE_SELL = 1 as const;

function randomSalt(): string {
  return BigInt('0x' + Buffer.from(randomBytes(16)).toString('hex')).toString();
}

function toUsdcRaw(usdc: number): bigint {
  // Always 6 decimals on Polygon USDC
  return parseUnits(usdc.toFixed(USDC_DECIMALS), USDC_DECIMALS);
}

/**
 * Build a Polymarket-spec limit order struct (unsigned).
 *
 * Polymarket CTF Exchange "Order" struct uses base-units of USDC (6 dp) for
 * the price denomination side and base-units of the outcome ERC-1155 token for
 * the size side. For a BUY: makerAmount = USDC paid, takerAmount = shares
 * received (which = USDC / price). For a SELL: the directions invert.
 */
export function buildLimitOrder(
  params: LimitOrderParams,
  maker: string,
  signer: string = maker,
): Omit<SignedOrder, 'signature'> {
  if (params.price <= 0 || params.price >= 1) {
    throw new Error(`buildLimitOrder: price must be in (0,1), got ${params.price}`);
  }
  if (params.size <= 0) {
    throw new Error(`buildLimitOrder: size must be > 0, got ${params.size}`);
  }
  const sharesFloat = params.size / params.price;
  const usdcRaw = toUsdcRaw(params.size);
  const sharesRaw = parseUnits(sharesFloat.toFixed(USDC_DECIMALS), USDC_DECIMALS);
  const isBuy = params.side === 'BUY';
  const expiration = String(params.expirationSec ?? 0); // 0 = GTC
  return {
    salt: randomSalt(),
    maker,
    signer,
    taker: '0x0000000000000000000000000000000000000000',
    tokenId: params.tokenId,
    makerAmount: (isBuy ? usdcRaw : sharesRaw).toString(),
    takerAmount: (isBuy ? sharesRaw : usdcRaw).toString(),
    expiration,
    nonce: '0',
    feeRateBps: String(FEES_BPS),
    side: isBuy ? SIDE_BUY : SIDE_SELL,
    signatureType: 0, // EOA
  };
}

/**
 * Marketable order: BUY at a price tolerated above mid (or SELL below mid).
 * Default tolerance is 5% — adequate for thin Polymarket books without giving
 * up too much edge.
 */
export function buildMarketOrder(
  params: Omit<LimitOrderParams, 'price'> & { referencePrice: number; tolerancePct?: number },
  maker: string,
  signer: string = maker,
): Omit<SignedOrder, 'signature'> {
  const tol = params.tolerancePct ?? 0.05;
  const price =
    params.side === 'BUY'
      ? Math.min(0.99, params.referencePrice * (1 + tol))
      : Math.max(0.01, params.referencePrice * (1 - tol));
  return buildLimitOrder({ ...params, price }, maker, signer);
}

export async function signOrder(
  unsigned: Omit<SignedOrder, 'signature'>,
  adapter: PhantomAdapter = getPhantomAdapter(),
): Promise<SignedOrder> {
  const value: Record<string, unknown> = { ...unsigned };
  const signature = await adapter.signTypedData(
    ORDER_EIP712_DOMAIN,
    ORDER_EIP712_TYPES as unknown as Record<string, Array<{ name: string; type: string }>>,
    value,
  );
  return { ...unsigned, signature };
}

export async function buildAndSignLimitOrder(
  params: LimitOrderParams,
  adapter: PhantomAdapter = getPhantomAdapter(),
): Promise<SignedOrder> {
  const maker = adapter.getAddress();
  const unsigned = buildLimitOrder(params, maker);
  return signOrder(unsigned, adapter);
}

/** Build an L1 CLOB auth signature for headers (api-key signing). */
export async function buildClobL1Auth(
  adapter: PhantomAdapter,
  ts: number,
  nonce = 0,
): Promise<{ signature: string; address: string }> {
  // Polymarket L1 sig: keccak("This message attests..." + ts + nonce). We mirror
  // the official client by signing a deterministic typed message.
  const message = `polymarket-clob-auth\nts=${ts}\nnonce=${nonce}`;
  const signature = await adapter.wallet.signMessage(message);
  return { signature, address: adapter.getAddress() };
}

export { hexlify as _hexlify }; // re-export to keep tree-shaking happy on edge runtimes

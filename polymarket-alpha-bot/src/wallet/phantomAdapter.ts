import bs58 from 'bs58';
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  TypedDataDomain,
  TypedDataField,
  parseUnits,
  formatUnits,
  hexlify,
} from 'ethers';
import { config } from '../config/env.js';
import { child } from '../monitoring/logger.js';
import { POLYMARKET_CONTRACTS, USDC_DECIMALS } from '../config/constants.js';

const log = child('wallet');

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

/**
 * Decode a base58 string into a 32-byte hex private key.
 * Phantom multichain exports the EVM key in base58 (64 bytes contain 32 priv +
 * 32 pub). We accept either a 32-byte or 64-byte payload.
 */
export function decodePhantomKey(base58Key: string): string {
  const raw = bs58.decode(base58Key.trim());
  let bytes: Uint8Array;
  if (raw.length === 32) bytes = raw;
  else if (raw.length === 64) bytes = raw.slice(0, 32);
  else throw new Error(`Unexpected Phantom key length: ${raw.length} bytes`);
  return hexlify(bytes);
}

export class PhantomAdapter {
  readonly provider: JsonRpcProvider;
  readonly wallet: Wallet;
  private usdcContract: Contract;

  constructor(opts?: { privateKey?: string; rpcUrl?: string; chainId?: number }) {
    const pk = opts?.privateKey ?? config.PHANTOM_PRIVATE_KEY;
    if (!pk) throw new Error('PHANTOM_PRIVATE_KEY is not set');

    const rpcUrl = opts?.rpcUrl ?? config.POLYGON_RPC_URL;
    const chainId = opts?.chainId ?? config.POLYGON_CHAIN_ID ?? 137;
    this.provider = new JsonRpcProvider(rpcUrl, chainId);

    let hexPk: string;
    if (pk.startsWith('0x') && pk.length === 66) hexPk = pk;
    else hexPk = decodePhantomKey(pk);

    this.wallet = new Wallet(hexPk, this.provider);
    this.usdcContract = new Contract(POLYMARKET_CONTRACTS.USDC, ERC20_ABI, this.wallet);
  }

  getAddress(): string {
    return this.wallet.address;
  }

  async getUsdcBalance(): Promise<number> {
    const raw: bigint = await this.usdcContract.balanceOf!(this.wallet.address);
    return Number(formatUnits(raw, USDC_DECIMALS));
  }

  async getUsdcAllowance(spender: string): Promise<number> {
    const raw: bigint = await this.usdcContract.allowance!(this.wallet.address, spender);
    return Number(formatUnits(raw, USDC_DECIMALS));
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>,
  ): Promise<string> {
    return this.wallet.signTypedData(domain, types, value);
  }

  /** Approve a spender to pull a USDC amount; returns tx hash. */
  async approveUsdc(
    spender: string = POLYMARKET_CONTRACTS.CTF_EXCHANGE,
    amount: number | 'max' = 'max',
  ): Promise<string> {
    const raw =
      amount === 'max'
        ? (2n ** 256n - 1n)
        : parseUnits(amount.toFixed(USDC_DECIMALS), USDC_DECIMALS);
    const tx = await this.usdcContract.approve!(spender, raw);
    log.info({ spender, txHash: tx.hash }, 'usdc approve submitted');
    const receipt = await tx.wait();
    log.info({ spender, block: receipt?.blockNumber }, 'usdc approve confirmed');
    return tx.hash;
  }

  /** Idempotent — only approves if current allowance < threshold. */
  async checkAndApprove(
    spender: string = POLYMARKET_CONTRACTS.CTF_EXCHANGE,
    threshold = 1_000_000,
  ): Promise<{ approved: boolean; txHash?: string }> {
    const current = await this.getUsdcAllowance(spender);
    if (current >= threshold) {
      log.info({ spender, allowance: current }, 'usdc allowance sufficient');
      return { approved: true };
    }
    const txHash = await this.approveUsdc(spender, 'max');
    return { approved: true, txHash };
  }
}

let _adapter: PhantomAdapter | null = null;

export function getPhantomAdapter(): PhantomAdapter {
  if (!_adapter) _adapter = new PhantomAdapter();
  return _adapter;
}

export function resetPhantomAdapter(): void {
  _adapter = null;
}

import bs58 from 'bs58';
import { Contract, JsonRpcProvider, Wallet, formatUnits, hexlify, parseUnits, type TypedDataDomain, type TypedDataField } from 'ethers';
import { config } from '../config/env.js';
import { POLYMARKET_CONTRACTS, USDC_DECIMALS } from '../config/constants.js';
import { logger } from '../monitoring/logger.js';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

export class PhantomAdapter {
  readonly provider: JsonRpcProvider;
  readonly wallet: Wallet;
  private readonly paperWallet: boolean;

  constructor(privateKey = config.PHANTOM_PRIVATE_KEY) {
    this.provider = new JsonRpcProvider(config.POLYGON_RPC_URL);
    this.paperWallet = !privateKey && config.PAPER_TRADING;
    if (this.paperWallet) {
      this.wallet = new Wallet(Wallet.createRandom().privateKey, this.provider);
      logger.warn('PAPER_TRADING enabled and PHANTOM_PRIVATE_KEY missing; using ephemeral paper wallet');
      return;
    }
    if (!privateKey) throw new Error('PHANTOM_PRIVATE_KEY is required when PAPER_TRADING=false');
    this.wallet = new Wallet(decodePrivateKey(privateKey), this.provider);
  }

  getAddress(): string {
    return this.wallet.address;
  }

  async getUsdcBalance(): Promise<number> {
    if (this.paperWallet) return 10_000;
    const usdc = new Contract(POLYMARKET_CONTRACTS.USDC, ERC20_ABI, this.provider);
    const balance = await usdc.balanceOf(this.wallet.address) as bigint;
    return Number(formatUnits(balance, USDC_DECIMALS));
  }

  async signTypedData(domain: TypedDataDomain, types: Record<string, TypedDataField[]>, value: Record<string, unknown>): Promise<string> {
    return this.wallet.signTypedData(domain, types, value);
  }

  async approveUsdc(spender: string, amount: bigint): Promise<string | null> {
    if (this.paperWallet) return null;
    const usdc = new Contract(POLYMARKET_CONTRACTS.USDC, ERC20_ABI, this.wallet);
    const tx = await usdc.approve(spender, amount) as { hash: string; wait: () => Promise<unknown> };
    await tx.wait();
    return tx.hash;
  }

  async checkAndApprove(spender = POLYMARKET_CONTRACTS.CTF_EXCHANGE, amount = parseUnits('1000000', USDC_DECIMALS)): Promise<boolean> {
    if (this.paperWallet) return true;
    const usdc = new Contract(POLYMARKET_CONTRACTS.USDC, ERC20_ABI, this.provider);
    const allowance = await usdc.allowance(this.wallet.address, spender) as bigint;
    if (allowance >= amount) return true;
    await this.approveUsdc(spender, amount);
    return true;
  }
}

function decodePrivateKey(raw: string): string {
  if (raw.startsWith('0x') && raw.length === 66) return raw;
  const decoded = bs58.decode(raw);
  if (decoded.length < 32) throw new Error('PHANTOM_PRIVATE_KEY must decode to at least 32 bytes');
  return hexlify(decoded.slice(0, 32));
}

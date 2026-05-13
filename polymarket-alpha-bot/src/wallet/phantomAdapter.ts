import { ethers } from 'ethers';
import bs58 from 'bs58';
import { config } from '../config/env';
import { USDC_ADDRESS, USDC_DECIMALS, CTF_EXCHANGE_ADDRESS, POLYGON_CHAIN_ID } from '../config/constants';

const USDC_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

function base58ToHex(base58Key: string): string {
  try {
    const decoded = bs58.decode(base58Key);
    if (decoded.length === 64) {
      // Solana-style: first 32 bytes are private key
      return '0x' + Buffer.from(decoded.slice(0, 32)).toString('hex');
    }
    return '0x' + Buffer.from(decoded).toString('hex');
  } catch {
    // Already hex or other format — return as-is
    return base58Key.startsWith('0x') ? base58Key : `0x${base58Key}`;
  }
}

export class PhantomAdapter {
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private usdcContract: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.POLYGON_RPC_URL, {
      chainId: POLYGON_CHAIN_ID,
      name: 'polygon',
    });

    const privateKeyHex = base58ToHex(config.PHANTOM_PRIVATE_KEY);
    this.wallet = new ethers.Wallet(privateKeyHex, this.provider);
    this.usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, this.wallet);
  }

  getAddress(): string {
    return this.wallet.address;
  }

  getWallet(): ethers.Wallet {
    return this.wallet;
  }

  getPrivateKeyHex(): string {
    return this.wallet.privateKey;
  }

  async getUsdcBalance(): Promise<number> {
    const rawBalance: bigint = await this.usdcContract.balanceOf(this.wallet.address);
    return Number(rawBalance) / Math.pow(10, USDC_DECIMALS);
  }

  async getUsdcAllowance(spender: string): Promise<bigint> {
    return this.usdcContract.allowance(this.wallet.address, spender);
  }

  async approveUsdc(spender: string, amount: bigint): Promise<string> {
    const tx = await this.usdcContract.approve(spender, amount);
    await tx.wait();
    return tx.hash;
  }

  async checkAndApprove(): Promise<void> {
    const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    const allowance = await this.getUsdcAllowance(CTF_EXCHANGE_ADDRESS);

    // Only approve if allowance is less than 1000 USDC
    const threshold = BigInt(1000 * Math.pow(10, USDC_DECIMALS));
    if (allowance < threshold) {
      await this.approveUsdc(CTF_EXCHANGE_ADDRESS, MAX_UINT256);
    }
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    return this.wallet.signTypedData(domain, types, value);
  }

  async getPolygonBalance(): Promise<number> {
    const balance = await this.provider.getBalance(this.wallet.address);
    return parseFloat(ethers.formatEther(balance));
  }
}

export const phantomAdapter = new PhantomAdapter();

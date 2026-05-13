import bs58 from "bs58";
import { Contract, JsonRpcProvider, Wallet, formatUnits, parseUnits } from "ethers";
import { ADDRESSES, USDC_DECIMALS } from "../config/constants.js";
import { config } from "../config/env.js";
import { logger } from "../monitoring/logger.js";

const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

export class PhantomAdapter {
  private readonly provider = new JsonRpcProvider(config.POLYGON_RPC_URL);
  private readonly wallet: Wallet;
  private readonly usdc: any;

  constructor() {
    const decoded = bs58.decode(config.PHANTOM_PRIVATE_KEY);
    const normalized = decoded.length === 64 ? decoded.slice(0, 32) : decoded;
    const hexKey = `0x${Buffer.from(normalized).toString("hex")}`;
    this.wallet = new Wallet(hexKey, this.provider);
    this.usdc = new Contract(ADDRESSES.usdc, erc20Abi, this.wallet);
  }

  public getWallet(): Wallet {
    return this.wallet;
  }

  public async getAddress(): Promise<string> {
    return this.wallet.getAddress();
  }

  public async getUsdcBalance(): Promise<number> {
    const address = await this.getAddress();
    const balance = await this.usdc.balanceOf(address);
    return Number(formatUnits(balance, USDC_DECIMALS));
  }

  public async signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ): Promise<string> {
    return this.wallet.signTypedData(domain, types, value);
  }

  public async approveUsdc(spender: string, amount: number): Promise<string> {
    const tx = await this.usdc.approve(spender, parseUnits(amount.toFixed(6), USDC_DECIMALS));
    const receipt = await tx.wait();
    const txHash = String(receipt?.hash ?? tx.hash ?? "");
    logger.info({ txHash, spender, amount }, "usdc approval submitted");
    return txHash;
  }

  public async checkAndApprove(spender = ADDRESSES.ctfExchange, minAmount = 1_000_000): Promise<boolean> {
    const owner = await this.getAddress();
    const currentAllowance = await this.usdc.allowance(owner, spender);
    const required = parseUnits(minAmount.toFixed(6), USDC_DECIMALS);

    if (currentAllowance >= required) {
      return false;
    }

    await this.approveUsdc(spender, minAmount);
    return true;
  }
}

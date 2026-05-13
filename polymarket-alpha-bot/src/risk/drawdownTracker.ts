import { CircuitBreaker } from "./circuitBreaker.js";

export class DrawdownTracker {
  private peakBalance = 0;
  private currentBalance = 0;
  private maxDrawdownPct = 0;

  constructor(initialBalance: number, private readonly circuitBreaker: CircuitBreaker) {
    this.peakBalance = initialBalance;
    this.currentBalance = initialBalance;
  }

  public update(balance: number): void {
    this.currentBalance = balance;
    this.peakBalance = Math.max(this.peakBalance, balance);
    const drawdown = this.getDrawdown();
    this.maxDrawdownPct = Math.max(this.maxDrawdownPct, drawdown);
    if (drawdown > 0.2) {
      this.circuitBreaker.open("drawdown_exceeded_20pct");
    }
  }

  public getDrawdown(): number {
    if (this.peakBalance <= 0) {
      return 0;
    }
    return Math.max(0, (this.peakBalance - this.currentBalance) / this.peakBalance);
  }

  public getMaxDrawdown(): number {
    return this.maxDrawdownPct;
  }
}

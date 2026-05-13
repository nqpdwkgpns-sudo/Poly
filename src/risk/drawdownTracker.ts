export class DrawdownTracker {
  private peakBalance: number;

  constructor(initialBalance = 0) {
    this.peakBalance = Math.max(0, initialBalance);
  }

  update(currentBalance: number): void {
    this.peakBalance = Math.max(this.peakBalance, currentBalance);
  }

  getDrawdown(currentBalance: number): number {
    if (this.peakBalance <= 0) return 0;
    return Math.max(0, (this.peakBalance - currentBalance) / this.peakBalance);
  }

  shouldTrigger(currentBalance: number): boolean {
    return this.getDrawdown(currentBalance) > 0.2;
  }

  get peak(): number {
    return this.peakBalance;
  }
}

import { BotState } from './state';
import { CircuitBreaker } from './circuitBreaker';
import { logger } from '../monitoring/logger';

const DRAWDOWN_CIRCUIT_THRESHOLD = 0.20;

export class DrawdownTracker {
  private state: BotState;
  private circuitBreaker: CircuitBreaker;

  constructor(state: BotState, circuitBreaker: CircuitBreaker) {
    this.state = state;
    this.circuitBreaker = circuitBreaker;
  }

  updateBalance(currentBalance: number): void {
    if (currentBalance > this.state.peakBalance) {
      this.state.peakBalance = currentBalance;
    }

    this.state.balanceUsdc = currentBalance;
    this.state.drawdownPct = this.getDrawdown();

    if (this.state.drawdownPct > DRAWDOWN_CIRCUIT_THRESHOLD) {
      logger.warn(
        { drawdownPct: this.state.drawdownPct, peak: this.state.peakBalance, current: currentBalance },
        'Drawdown exceeded 20% threshold'
      );
      this.circuitBreaker.checkDrawdown(this.state.drawdownPct);
    }
  }

  getDrawdown(): number {
    if (this.state.peakBalance <= 0) return 0;
    const dd = (this.state.peakBalance - this.state.balanceUsdc) / this.state.peakBalance;
    return Math.max(0, dd);
  }

  getDrawdownFromPeak(): number {
    return this.state.peakBalance - this.state.balanceUsdc;
  }

  getPeakBalance(): number {
    return this.state.peakBalance;
  }

  getDrawdownPercent(): number {
    return this.getDrawdown() * 100;
  }
}

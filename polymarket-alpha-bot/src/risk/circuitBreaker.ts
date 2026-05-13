import { BotState, CircuitBreakerStatus } from './state';
import { logger } from '../monitoring/logger';
import { telegramAlerter } from '../monitoring/telegramAlerter';

const MAX_CONSECUTIVE_FAILURES = 3;
const RPC_ERROR_WINDOW_MS = 60000;      // 1 minute
const MAX_RPC_ERRORS_PER_MIN = 10;
const COOLDOWN_MS = 30 * 60 * 1000;    // 30 minute cooldown
const HALF_OPEN_TEST_WINDOW_MS = 5 * 60 * 1000;

export class CircuitBreaker {
  private state: BotState;
  private halfOpenTestAllowed = true;
  private halfOpenTimer: NodeJS.Timeout | null = null;

  constructor(state: BotState) {
    this.state = state;
  }

  getStatus(): CircuitBreakerStatus {
    return this.state.circuitBreakerStatus;
  }

  isOpen(): boolean {
    return this.state.circuitBreakerStatus === 'OPEN';
  }

  isHalfOpen(): boolean {
    return this.state.circuitBreakerStatus === 'HALF_OPEN';
  }

  isClosed(): boolean {
    return this.state.circuitBreakerStatus === 'CLOSED';
  }

  canExecute(): boolean {
    if (this.state.circuitBreakerStatus === 'CLOSED') return true;
    if (this.state.circuitBreakerStatus === 'HALF_OPEN' && this.halfOpenTestAllowed) {
      this.halfOpenTestAllowed = false;
      return true;
    }
    return false;
  }

  open(reason: string): void {
    if (this.state.circuitBreakerStatus === 'OPEN') return;

    this.state.circuitBreakerStatus = 'OPEN';
    this.state.circuitBreakerOpenedAt = Date.now();
    this.state.circuitBreakerReason = reason;

    logger.error({ reason }, 'Circuit breaker OPENED');

    telegramAlerter
      .sendAlert(`🔴 Circuit breaker OPEN: ${reason}`)
      .catch(() => undefined);

    // Auto-transition to HALF_OPEN after cooldown
    setTimeout(() => {
      if (this.state.circuitBreakerStatus === 'OPEN') {
        this.transitionToHalfOpen();
      }
    }, COOLDOWN_MS);
  }

  private transitionToHalfOpen(): void {
    this.state.circuitBreakerStatus = 'HALF_OPEN';
    this.halfOpenTestAllowed = true;

    logger.info('Circuit breaker transitioning to HALF_OPEN');

    // If no successful trade in test window, re-open
    this.halfOpenTimer = setTimeout(() => {
      if (this.state.circuitBreakerStatus === 'HALF_OPEN') {
        this.open('HALF_OPEN test window expired without successful trade');
      }
    }, HALF_OPEN_TEST_WINDOW_MS);
  }

  close(): void {
    if (this.halfOpenTimer) {
      clearTimeout(this.halfOpenTimer);
      this.halfOpenTimer = null;
    }

    this.state.circuitBreakerStatus = 'CLOSED';
    this.state.circuitBreakerOpenedAt = null;
    this.state.circuitBreakerReason = null;
    this.state.consecutiveFailedOrders = 0;

    logger.info('Circuit breaker CLOSED — trading resumed');
    telegramAlerter.sendAlert('🟢 Circuit breaker CLOSED — trading resumed').catch(() => undefined);
  }

  recordOrderSuccess(): void {
    this.state.consecutiveFailedOrders = 0;
    if (this.state.circuitBreakerStatus === 'HALF_OPEN') {
      this.close();
    }
  }

  recordOrderFailure(): void {
    this.state.consecutiveFailedOrders++;
    if (this.state.consecutiveFailedOrders >= MAX_CONSECUTIVE_FAILURES) {
      this.open(`${MAX_CONSECUTIVE_FAILURES} consecutive order failures`);
    }
  }

  recordRpcError(): void {
    const now = Date.now();

    // Reset window if expired
    if (now - this.state.rpcErrorWindowStart > RPC_ERROR_WINDOW_MS) {
      this.state.rpcErrorCount = 0;
      this.state.rpcErrorWindowStart = now;
    }

    this.state.rpcErrorCount++;

    if (this.state.rpcErrorCount > MAX_RPC_ERRORS_PER_MIN) {
      this.open(`RPC error rate exceeded: ${this.state.rpcErrorCount} errors/min`);
    }
  }

  checkDailyLossBreach(dailyPnl: number, limitUsdc: number): void {
    if (dailyPnl <= -limitUsdc) {
      this.open(`Daily loss limit breached: ${dailyPnl.toFixed(2)} USDC`);
    }
  }

  checkDrawdown(drawdownPct: number): void {
    if (drawdownPct > 0.20) {
      this.open(`Drawdown exceeded 20%: ${(drawdownPct * 100).toFixed(1)}%`);
    }
  }
}

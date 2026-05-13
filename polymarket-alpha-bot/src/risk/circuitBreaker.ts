import { EventEmitter } from 'node:events';
import { child } from '../monitoring/logger.js';
import { RISK_LIMITS } from '../config/constants.js';
import { BotState, CircuitBreakerState } from './state.js';

const log = child('circuitBreaker');

export type TripReason =
  | 'consecutive_failures'
  | 'daily_loss_limit'
  | 'rpc_error_rate'
  | 'drawdown'
  | 'manual';

export class CircuitBreaker extends EventEmitter {
  private cooldownTimer: NodeJS.Timeout | null = null;
  private testOrderAllowed = false;

  constructor(private state: BotState) {
    super();
  }

  attachState(state: BotState): void {
    this.state = state;
  }

  getState(): CircuitBreakerState {
    return this.state.circuitBreaker;
  }

  isOpen(): boolean {
    return this.state.circuitBreaker === 'OPEN';
  }

  isClosed(): boolean {
    return this.state.circuitBreaker === 'CLOSED';
  }

  /** Allow a single test order while in HALF_OPEN. Returns whether allowed. */
  consumeTestSlot(): boolean {
    if (this.state.circuitBreaker !== 'HALF_OPEN') return false;
    if (!this.testOrderAllowed) return false;
    this.testOrderAllowed = false;
    return true;
  }

  recordOrderFailure(): void {
    this.state.consecutiveOrderFailures += 1;
    if (this.state.consecutiveOrderFailures >= RISK_LIMITS.CONSECUTIVE_FAIL_LIMIT) {
      this.trip('consecutive_failures', `${this.state.consecutiveOrderFailures} failures`);
    }
  }

  recordOrderSuccess(): void {
    this.state.consecutiveOrderFailures = 0;
    if (this.state.circuitBreaker === 'HALF_OPEN') this.reset();
  }

  recordRpcError(): void {
    const now = Date.now();
    if (now - this.state.rpcErrors.windowStart > 60_000) {
      this.state.rpcErrors = { count: 0, windowStart: now };
    }
    this.state.rpcErrors.count += 1;
    if (this.state.rpcErrors.count > RISK_LIMITS.RPC_ERROR_PER_MIN_LIMIT) {
      this.trip('rpc_error_rate', `${this.state.rpcErrors.count} rpc errors/min`);
    }
  }

  trip(reason: TripReason, detail?: string): void {
    if (this.state.circuitBreaker === 'OPEN') return;
    this.state.circuitBreaker = 'OPEN';
    this.state.circuitBreakerReason = `${reason}: ${detail ?? ''}`.trim();
    this.state.circuitBreakerOpenedAt = Date.now();
    log.error({ reason, detail }, 'circuit breaker OPEN');
    this.emit('open', { reason, detail });
    this.scheduleCooldown();
  }

  /** Move to HALF_OPEN — caller can submit a single probing order. */
  enterHalfOpen(): void {
    this.state.circuitBreaker = 'HALF_OPEN';
    this.testOrderAllowed = true;
    log.warn('circuit breaker HALF_OPEN: single test order permitted');
    this.emit('half_open');
  }

  reset(): void {
    this.state.circuitBreaker = 'CLOSED';
    this.state.circuitBreakerReason = undefined;
    this.state.circuitBreakerOpenedAt = undefined;
    this.state.consecutiveOrderFailures = 0;
    this.testOrderAllowed = false;
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    log.info('circuit breaker CLOSED');
    this.emit('reset');
  }

  private scheduleCooldown(): void {
    if (this.cooldownTimer) clearTimeout(this.cooldownTimer);
    this.cooldownTimer = setTimeout(() => {
      this.enterHalfOpen();
    }, RISK_LIMITS.CIRCUIT_BREAKER_COOLDOWN_MS);
  }
}

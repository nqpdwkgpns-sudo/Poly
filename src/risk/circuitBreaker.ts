import type { OrderManager } from '../execution/orderManager.js';
import type { TelegramAlerter } from '../monitoring/telegramAlerter.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private statusValue: CircuitState = 'CLOSED';
  private openedAt = 0;
  private halfOpenOrderUsed = false;

  constructor(
    private readonly cooldownMs = 30 * 60_000,
    private readonly orderManager?: Pick<OrderManager, 'cancelAllOrders'>,
    private readonly alerter?: Pick<TelegramAlerter, 'sendAlert'>
  ) {}

  get status(): CircuitState {
    if (this.statusValue === 'OPEN' && Date.now() - this.openedAt >= this.cooldownMs) {
      this.statusValue = 'HALF_OPEN';
      this.halfOpenOrderUsed = false;
    }
    return this.statusValue;
  }

  canSubmitOrder(): boolean {
    if (this.status === 'CLOSED') return true;
    if (this.status === 'HALF_OPEN' && !this.halfOpenOrderUsed) {
      this.halfOpenOrderUsed = true;
      return true;
    }
    return false;
  }

  async open(reason: string): Promise<void> {
    if (this.statusValue === 'OPEN') return;
    this.statusValue = 'OPEN';
    this.openedAt = Date.now();
    this.halfOpenOrderUsed = false;
    await Promise.allSettled([
      this.orderManager?.cancelAllOrders(),
      this.alerter?.sendAlert(`circuit_breaker_open: ${reason}`)
    ]);
  }

  close(): void {
    this.statusValue = 'CLOSED';
    this.openedAt = 0;
    this.halfOpenOrderUsed = false;
  }

  recordOrderResult(success: boolean): void {
    if (success && this.statusValue === 'HALF_OPEN') this.close();
    if (!success && this.statusValue === 'HALF_OPEN') void this.open('half-open test order failed');
  }

  shouldOpenForState(input: { failedOrders: number; dailyLossBreached: boolean; rpcErrorsLastMinute: number }): string | null {
    if (input.failedOrders >= 3) return '3 consecutive failed orders';
    if (input.dailyLossBreached) return 'daily loss limit breach';
    if (input.rpcErrorsLastMinute > 10) return 'RPC errors exceeded 10/min';
    return null;
  }
}

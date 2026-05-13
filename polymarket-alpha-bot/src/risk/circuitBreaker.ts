import { EventEmitter } from "node:events";
import { logger } from "../monitoring/logger.js";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = "CLOSED";
  private openedAt = 0;
  private readonly cooldownMs = 30 * 60_000;
  private testOrderAllowed = true;

  public getState(): CircuitState {
    if (this.state === "OPEN" && Date.now() - this.openedAt >= this.cooldownMs) {
      this.state = "HALF_OPEN";
      this.testOrderAllowed = true;
      this.emit("state_change", this.state);
    }
    return this.state;
  }

  public open(reason: string): void {
    this.state = "OPEN";
    this.openedAt = Date.now();
    this.testOrderAllowed = false;
    logger.error({ reason }, "circuit breaker opened");
    this.emit("open", reason);
    this.emit("state_change", this.state);
  }

  public close(): void {
    this.state = "CLOSED";
    this.testOrderAllowed = true;
    this.emit("state_change", this.state);
  }

  public canSubmitOrder(): boolean {
    const state = this.getState();
    if (state === "CLOSED") {
      return true;
    }
    if (state === "OPEN") {
      return false;
    }
    if (!this.testOrderAllowed) {
      return false;
    }
    this.testOrderAllowed = false;
    return true;
  }

  public onTestOrderSucceeded(): void {
    if (this.state === "HALF_OPEN") {
      this.close();
    }
  }

  public maybeOpenFromMetrics(metrics: {
    consecutiveFailedOrders: number;
    dailyLossLimitBreached: boolean;
    rpcErrorsPerMinute: number;
  }): void {
    if (
      metrics.consecutiveFailedOrders >= 3 ||
      metrics.dailyLossLimitBreached ||
      metrics.rpcErrorsPerMinute > 10
    ) {
      this.open("risk_metric_trigger");
    }
  }
}

import axios from 'axios';
import { config } from '../config/env';
import { logger } from './logger';

const TELEGRAM_API = 'https://api.telegram.org';

export type AlertType =
  | 'startup'
  | 'order_filled'
  | 'circuit_breaker_open'
  | 'daily_limit_hit'
  | 'pnl_summary'
  | 'info'
  | 'warning'
  | 'error';

class TelegramAlerter {
  private enabled: boolean;

  constructor() {
    this.enabled = Boolean(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID);
    if (!this.enabled) {
      logger.info('Telegram alerting disabled (no token/chat configured)');
    }
  }

  async sendAlert(message: string, type: AlertType = 'info'): Promise<void> {
    if (!this.enabled) return;

    const prefix = this.getPrefix(type);
    const fullMessage = `${prefix} ${message}`;

    try {
      await axios.post(
        `${TELEGRAM_API}/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: config.TELEGRAM_CHAT_ID,
          text: fullMessage,
          parse_mode: 'Markdown',
        },
        { timeout: 5000 }
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to send Telegram alert');
    }
  }

  async sendStartup(balance: number, positionCount: number): Promise<void> {
    await this.sendAlert(
      `Bot started\nBalance: $${balance.toFixed(2)} USDC\nOpen positions: ${positionCount}`,
      'startup'
    );
  }

  async sendOrderFilled(conditionId: string, side: string, price: number, size: number): Promise<void> {
    await this.sendAlert(
      `Order filled: ${side} $${size.toFixed(2)} @ ${price.toFixed(3)}\nMarket: ${conditionId}`,
      'order_filled'
    );
  }

  async sendDailyPnlSummary(dailyPnl: number, totalPnl: number, balance: number): Promise<void> {
    const emoji = dailyPnl >= 0 ? '📈' : '📉';
    await this.sendAlert(
      `${emoji} Daily P&L Summary\nToday: ${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}\nTotal: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}\nBalance: $${balance.toFixed(2)}`,
      'pnl_summary'
    );
  }

  async sendLimitWarning(limitName: string, utilizationPct: number): Promise<void> {
    await this.sendAlert(
      `⚠️ Risk limit warning: ${limitName} at ${(utilizationPct * 100).toFixed(0)}% utilization`,
      'warning'
    );
  }

  private getPrefix(type: AlertType): string {
    const prefixes: Record<AlertType, string> = {
      startup: '🚀',
      order_filled: '✅',
      circuit_breaker_open: '🔴',
      daily_limit_hit: '🛑',
      pnl_summary: '📊',
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
    };
    return prefixes[type] ?? 'ℹ️';
  }
}

export const telegramAlerter = new TelegramAlerter();

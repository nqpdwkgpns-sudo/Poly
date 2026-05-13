import axios from 'axios';
import { config } from '../config/env.js';
import { child } from './logger.js';

const log = child('telegram');

export type AlertType =
  | 'startup'
  | 'shutdown'
  | 'order_filled'
  | 'order_failed'
  | 'circuit_breaker_open'
  | 'circuit_breaker_reset'
  | 'daily_limit_hit'
  | 'pnl_summary'
  | 'risk_warning'
  | 'info';

export interface Alert {
  type: AlertType;
  message: string;
  data?: Record<string, unknown>;
}

export class TelegramAlerter {
  private enabled: boolean;

  constructor(private token = config.TELEGRAM_BOT_TOKEN, private chatId = config.TELEGRAM_CHAT_ID) {
    this.enabled = Boolean(token && chatId);
    if (!this.enabled) log.info('telegram alerts disabled (no token/chatId)');
  }

  async sendAlert(alert: Alert): Promise<void> {
    const text = this.format(alert);
    log.info({ type: alert.type }, text);
    if (!this.enabled) return;
    try {
      await axios.post(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        { chat_id: this.chatId, text, parse_mode: 'Markdown' },
        { timeout: 6000 },
      );
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'telegram send failed');
    }
  }

  private format(a: Alert): string {
    const emoji = ALERT_EMOJI[a.type] ?? '*';
    const lines = [`${emoji} *${a.type.toUpperCase()}*`, a.message];
    if (a.data) {
      for (const [k, v] of Object.entries(a.data)) {
        lines.push(`• ${k}: \`${typeof v === 'object' ? JSON.stringify(v) : String(v)}\``);
      }
    }
    return lines.join('\n');
  }
}

const ALERT_EMOJI: Record<AlertType, string> = {
  startup: '🟢',
  shutdown: '⚪',
  order_filled: '✅',
  order_failed: '❌',
  circuit_breaker_open: '🛑',
  circuit_breaker_reset: '🔵',
  daily_limit_hit: '🚨',
  pnl_summary: '📊',
  risk_warning: '⚠️',
  info: 'ℹ️',
};

export const telegramAlerter = new TelegramAlerter();

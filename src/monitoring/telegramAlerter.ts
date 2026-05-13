import axios from 'axios';
import { config } from '../config/env.js';
import { logger } from './logger.js';

export type AlertType = 'startup' | 'order_filled' | 'circuit_breaker_open' | 'daily_limit_hit' | 'pnl_summary' | 'risk_warning';

export class TelegramAlerter {
  constructor(private readonly token = config.TELEGRAM_BOT_TOKEN, private readonly chatId = config.TELEGRAM_CHAT_ID) {}

  async sendAlert(message: string, type: AlertType = 'risk_warning'): Promise<void> {
    if (!this.token || !this.chatId) {
      logger.debug({ type, message }, 'telegram alert skipped because token/chat id are not configured');
      return;
    }
    await axios.post(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      chat_id: this.chatId,
      text: `[${type}] ${message}`,
      disable_web_page_preview: true
    }, { timeout: 5_000 });
  }
}

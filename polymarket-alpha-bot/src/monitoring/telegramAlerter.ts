import { config } from "../config/env.js";
import { logger } from "./logger.js";

export class TelegramAlerter {
  public async sendAlert(message: string): Promise<void> {
    if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
      logger.debug({ message }, "telegram not configured; alert skipped");
      return;
    }

    const endpoint = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.TELEGRAM_CHAT_ID,
        text: message
      })
    });

    if (!response.ok) {
      logger.warn({ status: response.status, message }, "telegram alert failed");
    }
  }
}

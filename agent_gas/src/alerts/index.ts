// Aetheris\agent_gas\src\alerts\index.ts

/**
 * alerts/index.ts — Alert sender for Agent Gas
 *
 * Sends structured alerts to Telegram and/or Discord.
 * All sends are fire-and-forget — failures are logged but never thrown.
 *
 * Alert format:
 *   [AGENT_GAS] 🚨 ERROR
 *   Bundle submission failed
 *   tx: 0x...
 *   ops: 5
 */

import axios from 'axios';
import { Config } from '../config';

export class AlertSender {
  constructor(private readonly config: Config) {}

  /** Send an info-level alert. */
  async info(message: string): Promise<void> {
    await this.broadcast(`[AGENT_GAS] ℹ️ INFO\n${message}`);
  }

  /** Send a warning-level alert. */
  async warning(message: string): Promise<void> {
    await this.broadcast(`[AGENT_GAS] ⚠️ WARNING\n${message}`);
  }

  /** Send an error-level alert. */
  async error(message: string): Promise<void> {
    await this.broadcast(`[AGENT_GAS] ❌ ERROR\n${message}`);
  }

  /** Send a daily summary alert. */
  async dailySummary(summary: string): Promise<void> {
    await this.broadcast(`[AGENT_GAS] 📊 DAILY SUMMARY\n${summary}`);
  }

  /** Broadcast to all configured alert channels. */
  private async broadcast(message: string): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.config.telegramBotToken && this.config.telegramChatId) {
      promises.push(this.sendTelegram(message));
    }

    if (this.config.discordWebhookUrl) {
      promises.push(this.sendDiscord(message));
    }

    if (promises.length === 0) {
      // No channels configured — log to stdout
      console.log(`[ALERT] ${message}`);
      return;
    }

    await Promise.allSettled(promises);
  }

  private async sendTelegram(message: string): Promise<void> {
    try {
      const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
      await axios.post(url, {
        chat_id: this.config.telegramChatId,
        text: message,
        parse_mode: 'Markdown',
      }, { timeout: 10_000 });
    } catch (err) {
      console.warn(`[ALERT] Telegram send failed: ${err}`);
    }
  }

  private async sendDiscord(message: string): Promise<void> {
    try {
      // Discord webhooks have a 2000 char limit
      const content = message.length > 1900
        ? message.slice(0, 1900) + '... [truncated]'
        : message;

      await axios.post(this.config.discordWebhookUrl!, { content }, { timeout: 10_000 });
    } catch (err) {
      console.warn(`[ALERT] Discord send failed: ${err}`);
    }
  }
}

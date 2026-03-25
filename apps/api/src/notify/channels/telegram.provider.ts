import { Injectable, Logger } from '@nestjs/common';
import type { AlertTrigger } from '../../redpanda/redpanda.interfaces';
import type { NotificationResult } from './slack.provider';

@Injectable()
export class TelegramProvider {
  private readonly logger = new Logger(TelegramProvider.name);

  async send(
    destination: string,
    trigger: AlertTrigger,
    config: Record<string, unknown>,
  ): Promise<NotificationResult> {
    const botToken = config.botToken as string;
    if (!botToken) {
      return { success: false, error: 'Missing botToken in alert config' };
    }

    try {
      const text = [
        `🚨 *${this.escapeMarkdown(trigger.monitorName)}* is down`,
        '',
        `*Reason:* ${this.escapeMarkdown(trigger.reason)}`,
        `*Time:* ${new Date(trigger.timestamp).toUTCString()}`,
        `*Incident:* \`${trigger.incidentId.slice(0, 8)}\``,
      ].join('\n');

      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: destination,
            text,
            parse_mode: 'MarkdownV2',
          }),
        },
      );

      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `Telegram API ${res.status}: ${body}` };
      }

      const data = await res.json();
      return { success: true, response: data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }
}

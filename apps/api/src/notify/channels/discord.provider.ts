import { Injectable, Logger } from '@nestjs/common';
import type { AlertTrigger } from '../../redpanda/redpanda.interfaces';
import type { NotificationResult } from './slack.provider';

@Injectable()
export class DiscordProvider {
  private readonly logger = new Logger(DiscordProvider.name);

  async send(
    destination: string,
    trigger: AlertTrigger,
    config: Record<string, unknown>,
  ): Promise<NotificationResult> {
    try {
      const res = await fetch(destination, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: `🚨 ${trigger.monitorName} is down`,
              color: 0xff0000,
              fields: [
                { name: 'Reason', value: trigger.reason, inline: true },
                {
                  name: 'Time',
                  value: new Date(trigger.timestamp).toUTCString(),
                  inline: true,
                },
              ],
              timestamp: trigger.timestamp,
            },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `Discord API ${res.status}: ${body}` };
      }

      return { success: true, response: { status: res.status } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

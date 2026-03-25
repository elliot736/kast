import { Injectable, Logger } from '@nestjs/common';
import type { AlertTrigger } from '../../redpanda/redpanda.interfaces';

export interface NotificationResult {
  success: boolean;
  error?: string;
  response?: unknown;
}

@Injectable()
export class SlackProvider {
  private readonly logger = new Logger(SlackProvider.name);

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
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `🚨 ${trigger.monitorName} is down`,
                emoji: true,
              },
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Reason:*\n${trigger.reason}`,
                },
                {
                  type: 'mrkdwn',
                  text: `*Time:*\n${new Date(trigger.timestamp).toUTCString()}`,
                },
              ],
            },
          ],
          text: `Alert: ${trigger.monitorName} — ${trigger.reason}`,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `Slack API ${res.status}: ${body}` };
      }

      return { success: true, response: { status: res.status } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

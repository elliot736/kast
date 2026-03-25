import { Injectable, Logger } from '@nestjs/common';
import type { AlertTrigger } from '../../redpanda/redpanda.interfaces';
import type { NotificationResult } from './slack.provider';
import { validateOutboundUrl } from '../../common/util/url-validator';

@Injectable()
export class WebhookProvider {
  private readonly logger = new Logger(WebhookProvider.name);

  async send(
    destination: string,
    trigger: AlertTrigger,
    config: Record<string, unknown>,
  ): Promise<NotificationResult> {
    try {
      await validateOutboundUrl(destination);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Support custom headers from config
      if (config.headers && typeof config.headers === 'object') {
        Object.assign(headers, config.headers);
      }

      const res = await fetch(destination, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event: 'incident.opened',
          incidentId: trigger.incidentId,
          monitorId: trigger.monitorId,
          monitorName: trigger.monitorName,
          reason: trigger.reason,
          timestamp: trigger.timestamp,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `Webhook ${res.status}: ${body}` };
      }

      return { success: true, response: { status: res.status } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

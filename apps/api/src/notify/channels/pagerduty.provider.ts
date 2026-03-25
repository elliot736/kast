import { Injectable, Logger } from '@nestjs/common';
import type { AlertTrigger } from '../../redpanda/redpanda.interfaces';
import type { NotificationResult } from './slack.provider';

@Injectable()
export class PagerDutyProvider {
  private readonly logger = new Logger(PagerDutyProvider.name);

  async send(
    destination: string,
    trigger: AlertTrigger,
    config: Record<string, unknown>,
  ): Promise<NotificationResult> {
    try {
      const res = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routing_key: destination,
          event_action: 'trigger',
          dedup_key: `kast-${trigger.incidentId}`,
          payload: {
            summary: `${trigger.monitorName}: ${trigger.reason}`,
            source: 'kast',
            severity: 'critical',
            timestamp: trigger.timestamp,
            custom_details: {
              monitor_id: trigger.monitorId,
              monitor_name: trigger.monitorName,
              incident_id: trigger.incidentId,
              reason: trigger.reason,
            },
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `PagerDuty API ${res.status}: ${body}` };
      }

      const data = await res.json();
      return { success: true, response: data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS, CONSUMER_GROUPS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import { alertConfigs, alertLog } from '../database/schema';
import type { AlertTrigger } from '../redpanda/redpanda.interfaces';
import { SlackProvider, type NotificationResult } from './channels/slack.provider';
import { DiscordProvider } from './channels/discord.provider';
import { EmailProvider } from './channels/email.provider';
import { WebhookProvider } from './channels/webhook.provider';
import { PagerDutyProvider } from './channels/pagerduty.provider';
import { TelegramProvider } from './channels/telegram.provider';
import { MetricsService } from '../common/metrics/metrics.service';

const RETRY_DELAYS = [30_000, 120_000, 900_000, 3_600_000, 21_600_000]; // 30s, 2m, 15m, 1h, 6h

@Injectable()
export class NotifyService implements OnModuleInit {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
    private slack: SlackProvider,
    private discord: DiscordProvider,
    private email: EmailProvider,
    private webhook: WebhookProvider,
    private pagerduty: PagerDutyProvider,
    private telegram: TelegramProvider,
    private metrics: MetricsService,
  ) {}

  async onModuleInit() {
    // Consume alert triggers
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.NOTIFY,
      TOPICS.ALERT_TRIGGERS.name,
      async ({ message }) => {
        let trigger: AlertTrigger;
        try {
          trigger = JSON.parse(message.value!.toString());
        } catch {
          this.logger.warn('Skipping malformed Kafka message');
          return;
        }
        await this.handleTrigger(trigger);
      },
    );

    // Consume retries
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.NOTIFY + '-retries',
      TOPICS.ALERT_RETRIES.name,
      async ({ message }) => {
        let payload: any;
        try {
          payload = JSON.parse(message.value!.toString());
        } catch {
          this.logger.warn('Skipping malformed Kafka message');
          return;
        }
        await this.handleRetry(payload);
      },
    );

    this.logger.log('Notify consumers started');
  }

  private async handleTrigger(trigger: AlertTrigger) {
    // Find all enabled alert configs for this monitor
    const configs = await this.db
      .select()
      .from(alertConfigs)
      .where(eq(alertConfigs.monitorId, trigger.monitorId));

    const enabledConfigs = configs.filter((c) => c.isEnabled);

    if (enabledConfigs.length === 0) {
      this.logger.debug(`No alert configs for monitor ${trigger.monitorId}`);
      return;
    }

    for (const config of enabledConfigs) {
      await this.dispatch(trigger, config);
    }
  }

  private async dispatch(
    trigger: AlertTrigger,
    config: typeof alertConfigs.$inferSelect,
  ) {
    // Enforce alert cooldown
    if (config.cooldownMinutes && config.cooldownMinutes > 0) {
      const [lastSent] = await this.db
        .select()
        .from(alertLog)
        .where(
          and(
            eq(alertLog.alertConfigId, config.id),
            eq(alertLog.status, 'sent'),
          ),
        )
        .orderBy(desc(alertLog.sentAt))
        .limit(1);

      if (lastSent && Date.now() - lastSent.sentAt.getTime() < config.cooldownMinutes * 60_000) {
        this.logger.debug(
          `Skipping ${config.channel} alert for ${trigger.monitorName}: cooldown active (${config.cooldownMinutes}m)`,
        );
        return;
      }
    }

    let result: NotificationResult;

    switch (config.channel) {
      case 'slack':
        result = await this.slack.send(
          config.destination,
          trigger,
          (config.config as Record<string, unknown>) ?? {},
        );
        break;
      case 'discord':
        result = await this.discord.send(
          config.destination,
          trigger,
          (config.config as Record<string, unknown>) ?? {},
        );
        break;
      case 'email':
        result = await this.email.send(
          config.destination,
          trigger,
          (config.config as Record<string, unknown>) ?? {},
        );
        break;
      case 'webhook':
        result = await this.webhook.send(
          config.destination,
          trigger,
          (config.config as Record<string, unknown>) ?? {},
        );
        break;
      case 'pagerduty':
        result = await this.pagerduty.send(
          config.destination,
          trigger,
          (config.config as Record<string, unknown>) ?? {},
        );
        break;
      case 'telegram':
        result = await this.telegram.send(
          config.destination,
          trigger,
          (config.config as Record<string, unknown>) ?? {},
        );
        break;
      default:
        this.logger.warn(`Unsupported channel: ${config.channel}`);
        return;
    }

    // Log the delivery attempt
    await this.db.insert(alertLog).values({
      incidentId: trigger.incidentId,
      alertConfigId: config.id,
      channel: config.channel,
      status: result.success ? 'sent' : 'failed',
      attempts: 1,
      lastError: result.error ?? null,
      response: result.response as Record<string, unknown> | null,
    });

    this.metrics.alertDeliveriesTotal.inc({
      channel: config.channel,
      status: result.success ? 'success' : 'failure',
    });

    if (!result.success) {
      this.logger.warn(
        `Failed to send ${config.channel} alert for ${trigger.monitorName}: ${result.error}`,
      );
      // Schedule retry
      await this.scheduleRetry(trigger, config, 1);
    } else {
      this.logger.log(
        `Sent ${config.channel} alert for ${trigger.monitorName}`,
      );
    }
  }

  private async scheduleRetry(
    trigger: AlertTrigger,
    config: typeof alertConfigs.$inferSelect,
    attempt: number,
  ) {
    if (attempt > RETRY_DELAYS.length) {
      // Move to dead letter
      await this.redpanda.publish(
        TOPICS.ALERT_DEADLETTER.name,
        config.id,
        {
          trigger,
          alertConfigId: config.id,
          channel: config.channel,
          destination: config.destination,
          attempts: attempt,
          timestamp: new Date().toISOString(),
        },
      );
      this.logger.error(
        `Alert for ${trigger.monitorName} exhausted retries — moved to dead letter`,
      );
      return;
    }

    // Publish to retry topic with delay metadata
    await this.redpanda.publish(
      TOPICS.ALERT_RETRIES.name,
      config.id,
      {
        trigger,
        alertConfigId: config.id,
        channel: config.channel,
        destination: config.destination,
        config: config.config,
        attempt,
        retryAfter: new Date(Date.now() + RETRY_DELAYS[attempt - 1]).toISOString(),
      },
    );
  }

  private async handleRetry(payload: {
    trigger: AlertTrigger;
    alertConfigId: string;
    channel: string;
    destination: string;
    config: Record<string, unknown>;
    attempt: number;
    retryAfter: string;
  }) {
    // Check if it's time to retry
    if (new Date(payload.retryAfter) > new Date()) {
      // Re-publish for later processing
      await this.redpanda.publish(
        TOPICS.ALERT_RETRIES.name,
        payload.alertConfigId,
        payload,
      );
      return;
    }

    let result: NotificationResult;

    switch (payload.channel) {
      case 'slack':
        result = await this.slack.send(payload.destination, payload.trigger, payload.config ?? {});
        break;
      case 'discord':
        result = await this.discord.send(payload.destination, payload.trigger, payload.config ?? {});
        break;
      case 'email':
        result = await this.email.send(payload.destination, payload.trigger, payload.config ?? {});
        break;
      case 'webhook':
        result = await this.webhook.send(payload.destination, payload.trigger, payload.config ?? {});
        break;
      case 'pagerduty':
        result = await this.pagerduty.send(payload.destination, payload.trigger, payload.config ?? {});
        break;
      case 'telegram':
        result = await this.telegram.send(payload.destination, payload.trigger, payload.config ?? {});
        break;
      default:
        return;
    }

    // Update alert log
    await this.db.insert(alertLog).values({
      incidentId: payload.trigger.incidentId,
      alertConfigId: payload.alertConfigId,
      channel: payload.channel as typeof alertConfigs.$inferSelect['channel'],
      status: result.success ? 'sent' : 'retrying',
      attempts: payload.attempt + 1,
      lastError: result.error ?? null,
      response: result.response as Record<string, unknown> | null,
    });

    if (!result.success) {
      await this.scheduleRetry(
        payload.trigger,
        {
          id: payload.alertConfigId,
          channel: payload.channel,
          destination: payload.destination,
          config: payload.config,
        } as unknown as typeof alertConfigs.$inferSelect,
        payload.attempt + 1,
      );
    }
  }
}

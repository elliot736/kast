import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.provider';
import { alertConfigs, alertLog } from '../database/schema';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS } from '../redpanda/redpanda.constants';
import type { CreateAlertConfigDto, UpdateAlertConfigDto } from './alert.dto';

@Injectable()
export class AlertService {
  constructor(
    @Inject(DRIZZLE) private db: Database,
    private redpanda: RedpandaService,
  ) {}

  async createConfig(dto: CreateAlertConfigDto) {
    const [config] = await this.db
      .insert(alertConfigs)
      .values(dto)
      .returning();
    return config;
  }

  async listConfigs(monitorId?: string) {
    if (monitorId) {
      return this.db
        .select()
        .from(alertConfigs)
        .where(eq(alertConfigs.monitorId, monitorId));
    }
    return this.db.select().from(alertConfigs);
  }

  async updateConfig(id: string, dto: UpdateAlertConfigDto) {
    const [config] = await this.db
      .update(alertConfigs)
      .set(dto)
      .where(eq(alertConfigs.id, id))
      .returning();
    if (!config) throw new NotFoundException('Alert config not found');
    return config;
  }

  async deleteConfig(id: string) {
    const [config] = await this.db
      .delete(alertConfigs)
      .where(eq(alertConfigs.id, id))
      .returning({ id: alertConfigs.id });
    if (!config) throw new NotFoundException('Alert config not found');
  }

  async listDeadLetters() {
    return this.db
      .select()
      .from(alertLog)
      .where(eq(alertLog.status, 'failed'))
      .orderBy(desc(alertLog.sentAt))
      .limit(100);
  }

  async retryDeadLetter(id: string) {
    const [entry] = await this.db
      .select()
      .from(alertLog)
      .where(eq(alertLog.id, id))
      .limit(1);

    if (!entry) throw new NotFoundException('Dead letter not found');

    // Re-publish the alert trigger
    const [config] = await this.db
      .select()
      .from(alertConfigs)
      .where(eq(alertConfigs.id, entry.alertConfigId))
      .limit(1);

    if (!config) throw new NotFoundException('Alert config no longer exists');

    // Create a new alert trigger for this retry
    await this.redpanda.publish(
      TOPICS.ALERT_TRIGGERS.name,
      entry.incidentId,
      {
        incidentId: entry.incidentId,
        monitorId: config.monitorId,
        monitorName: 'Retry',
        reason: 'Manual retry from dead letter',
        timestamp: new Date().toISOString(),
      },
    );

    return { retried: true };
  }
}

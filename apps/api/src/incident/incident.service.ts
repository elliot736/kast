import { Inject, Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS, CONSUMER_GROUPS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import { incidents, monitors } from '../database/schema';
import type {
  PingEvent,
  MonitorEvaluation,
  IncidentEvent,
  AlertTrigger,
} from '../redpanda/redpanda.interfaces';
import { MetricsService } from '../common/metrics/metrics.service';

@Injectable()
export class IncidentService implements OnModuleInit {
  private readonly logger = new Logger(IncidentService.name);

  constructor(
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
    private metrics: MetricsService,
  ) {}

  async onModuleInit() {
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.INCIDENTS,
      TOPICS.MONITOR_EVALUATIONS.name,
      async ({ message }) => {
        let evaluation: MonitorEvaluation;
        try {
          evaluation = JSON.parse(message.value!.toString());
        } catch {
          this.logger.warn('Skipping malformed Kafka message');
          return;
        }
        await this.handleEvaluation(evaluation);
      },
    );

    // Also subscribe to ping-events to auto-resolve incidents
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.INCIDENTS_PINGS,
      TOPICS.PING_EVENTS.name,
      async ({ message }) => {
        let event: PingEvent;
        try {
          event = JSON.parse(message.value!.toString());
        } catch {
          this.logger.warn('Skipping malformed Kafka message');
          return;
        }
        if (event.type === 'success') {
          await this.resolveOpenIncidents(event.monitorId);
        }
      },
    );

    this.logger.log('Incident consumer started');
  }

  private async handleEvaluation(evaluation: MonitorEvaluation) {
    if (evaluation.result === 'healthy') return;

    // Check for existing open incident
    const [existing] = await this.db
      .select()
      .from(incidents)
      .where(
        and(
          eq(incidents.monitorId, evaluation.monitorId),
          eq(incidents.status, 'open'),
        ),
      )
      .limit(1);

    if (existing) {
      // Update missed count
      await this.db
        .update(incidents)
        .set({
          missedPingsCount: (existing.missedPingsCount ?? 0) + 1,
        })
        .where(eq(incidents.id, existing.id));
      return;
    }

    // Open new incident
    const [incident] = await this.db
      .insert(incidents)
      .values({
        monitorId: evaluation.monitorId,
        reason: evaluation.result === 'missed' ? 'missed_ping' : evaluation.result === 'failed' ? 'fail_ping' : 'late_ping',
        missedPingsCount: 1,
      })
      .returning();

    // Publish incident event
    const incidentEvent: IncidentEvent = {
      incidentId: incident.id,
      monitorId: evaluation.monitorId,
      action: 'opened',
      reason: incident.reason ?? 'unknown',
      timestamp: new Date().toISOString(),
    };

    await this.redpanda.publish(
      TOPICS.INCIDENT_EVENTS.name,
      evaluation.monitorId,
      incidentEvent,
    );

    // Fetch monitor name for alert trigger
    const [monitor] = await this.db
      .select({ name: monitors.name })
      .from(monitors)
      .where(eq(monitors.id, evaluation.monitorId))
      .limit(1);

    // Publish alert trigger
    const trigger: AlertTrigger = {
      incidentId: incident.id,
      monitorId: evaluation.monitorId,
      monitorName: monitor?.name ?? 'Unknown',
      reason: incident.reason ?? 'unknown',
      timestamp: new Date().toISOString(),
    };

    await this.redpanda.publish(
      TOPICS.ALERT_TRIGGERS.name,
      incident.id,
      trigger,
    );

    this.metrics.incidentsOpenedTotal.inc();
    this.logger.warn(`Incident opened for monitor ${evaluation.monitorId}: ${incident.reason}`);
  }

  private async resolveOpenIncidents(monitorId: string) {
    const openIncidents = await this.db
      .select()
      .from(incidents)
      .where(
        and(
          eq(incidents.monitorId, monitorId),
          sql`${incidents.status} IN ('open', 'acknowledged')`,
        ),
      );

    for (const incident of openIncidents) {
      const now = new Date();
      const downtimeSeconds = Math.floor(
        (now.getTime() - incident.startedAt.getTime()) / 1000,
      );

      await this.db
        .update(incidents)
        .set({
          status: 'resolved',
          resolvedAt: now,
          downtimeSeconds,
        })
        .where(eq(incidents.id, incident.id));

      const event: IncidentEvent = {
        incidentId: incident.id,
        monitorId,
        action: 'resolved',
        reason: incident.reason ?? 'unknown',
        timestamp: now.toISOString(),
      };

      await this.redpanda.publish(
        TOPICS.INCIDENT_EVENTS.name,
        monitorId,
        event,
      );

      this.logger.log(`Incident ${incident.id} resolved for monitor ${monitorId}`);
    }
  }

  async acknowledge(id: string, acknowledgedBy?: string) {
    const [incident] = await this.db
      .update(incidents)
      .set({
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        acknowledgedBy: acknowledgedBy ?? null,
      })
      .where(and(eq(incidents.id, id), eq(incidents.status, 'open')))
      .returning();

    if (!incident) throw new NotFoundException('Open incident not found');

    const event: IncidentEvent = {
      incidentId: incident.id,
      monitorId: incident.monitorId,
      action: 'acknowledged',
      reason: incident.reason ?? 'unknown',
      timestamp: new Date().toISOString(),
    };

    await this.redpanda.publish(
      TOPICS.INCIDENT_EVENTS.name,
      incident.monitorId,
      event,
    );

    return incident;
  }

  async findAll(status?: 'open' | 'acknowledged' | 'resolved') {
    if (status) {
      return this.db
        .select()
        .from(incidents)
        .where(eq(incidents.status, status))
        .orderBy(desc(incidents.startedAt));
    }
    return this.db.select().from(incidents).orderBy(desc(incidents.startedAt));
  }

  async findById(id: string) {
    const [incident] = await this.db
      .select()
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }
}

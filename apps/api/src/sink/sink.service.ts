import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS, CONSUMER_GROUPS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import { pings, monitors } from '../database/schema';
import type { PingEvent } from '../redpanda/redpanda.interfaces';
import { MetricsService } from '../common/metrics/metrics.service';

const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 200;

@Injectable()
export class SinkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SinkService.name);
  private buffer: PingEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly startTimes = new Map<string, Date>();

  constructor(
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
    private metrics: MetricsService,
  ) {}

  async onModuleInit() {
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.SINK,
      TOPICS.PING_EVENTS.name,
      async ({ message }) => {
        let event: PingEvent;
        try {
          event = JSON.parse(message.value!.toString());
        } catch {
          this.logger.warn('Skipping malformed Kafka message');
          return;
        }
        this.buffer.push(event);
        if (this.buffer.length >= BATCH_SIZE) {
          await this.flush();
        }
      },
    );

    this.flushTimer = setInterval(() => {
      this.flush().catch((err) =>
        this.logger.error('Flush failed', err),
      );
    }, FLUSH_INTERVAL_MS);

    this.logger.log('Sink consumer started');
  }

  async onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  private async flush() {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);

    // Track start times and compute durations
    const rows = batch.map((event) => {
      let durationMs: number | null = null;

      if (event.type === 'start') {
        this.startTimes.set(event.monitorId, new Date(event.timestamp));
      } else if (event.type === 'success') {
        const startTime = this.startTimes.get(event.monitorId);
        if (startTime) {
          const dur = new Date(event.timestamp).getTime() - startTime.getTime();
          if (dur >= 0) durationMs = dur;
          this.startTimes.delete(event.monitorId);
        }
      }

      this.metrics.pingEventsTotal.inc({ type: event.type });

      return {
        monitorId: event.monitorId,
        type: event.type as 'start' | 'success' | 'fail' | 'log',
        body: event.body ?? null,
        durationMs,
        userAgent: event.userAgent ?? null,
        sourceIp: event.sourceIp ?? null,
        createdAt: new Date(event.timestamp),
      };
    });

    // Evict stale startTimes (orphaned starts older than 5 minutes)
    const staleThreshold = Date.now() - 5 * 60 * 1000;
    for (const [id, time] of this.startTimes) {
      if (time.getTime() < staleThreshold) this.startTimes.delete(id);
    }

    // Batch insert all pings
    await this.db.insert(pings).values(rows);

    // Group by monitorId, take the latest event per monitor for status update
    const latestByMonitor = new Map<string, PingEvent>();
    for (const event of batch) {
      const existing = latestByMonitor.get(event.monitorId);
      if (!existing || event.timestamp > existing.timestamp) {
        latestByMonitor.set(event.monitorId, event);
      }
    }

    // Update monitors based on latest event
    for (const [monitorId, event] of latestByMonitor) {
      if (event.type === 'success' || event.type === 'start') {
        await this.db
          .update(monitors)
          .set({
            lastPingAt: new Date(event.timestamp),
            status: 'healthy',
            consecutiveFailures: 0,
            updatedAt: new Date(),
          })
          .where(eq(monitors.id, monitorId));
      } else if (event.type === 'fail') {
        await this.db
          .update(monitors)
          .set({
            lastPingAt: new Date(event.timestamp),
            updatedAt: new Date(),
          })
          .where(eq(monitors.id, monitorId));
      }
    }
  }
}

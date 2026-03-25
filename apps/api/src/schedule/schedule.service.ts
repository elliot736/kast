import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { eq, and, lt, isNotNull, or, desc } from 'drizzle-orm';
import { CronExpressionParser } from 'cron-parser';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS, CONSUMER_GROUPS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import { monitors, pings } from '../database/schema';
import type {
  PingEvent,
  MonitorStateEvent,
  MonitorEvaluation,
} from '../redpanda/redpanda.interfaces';

@Injectable()
export class ScheduleService implements OnModuleInit {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
  ) {}

  async onModuleInit() {
    // Subscribe to ping events to update next expected time
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.SCHEDULER,
      TOPICS.PING_EVENTS.name,
      async ({ message }) => {
        const event: PingEvent = JSON.parse(message.value!.toString());
        await this.handlePingEvent(event);
      },
    );

    this.logger.log('Schedule consumer started');
  }

  private async handlePingEvent(event: PingEvent) {
    if (event.type !== 'success' && event.type !== 'start') return;

    // Recalculate next expected time
    const [monitor] = await this.db
      .select()
      .from(monitors)
      .where(eq(monitors.id, event.monitorId))
      .limit(1);

    if (!monitor || monitor.isPaused) return;

    let nextExpected: Date | null = null;

    if (monitor.schedule) {
      try {
        const interval = CronExpressionParser.parse(monitor.schedule);
        nextExpected = interval.next().toDate();
      } catch {
        this.logger.warn(`Invalid cron expression for monitor ${monitor.id}: ${monitor.schedule}`);
      }
    } else if (monitor.intervalSeconds) {
      nextExpected = new Date(Date.now() + monitor.intervalSeconds * 1000);
    }

    if (nextExpected) {
      await this.db
        .update(monitors)
        .set({ nextExpectedAt: nextExpected, updatedAt: new Date() })
        .where(eq(monitors.id, monitor.id));
    }

    // Publish monitor state
    const stateEvent: MonitorStateEvent = {
      monitorId: monitor.id,
      status: 'healthy',
      lastPingAt: event.timestamp,
      nextExpectedAt: nextExpected?.toISOString() ?? null,
      consecutiveFailures: 0,
      timestamp: new Date().toISOString(),
    };

    await this.redpanda.publish(
      TOPICS.MONITOR_STATE.name,
      monitor.id,
      stateEvent,
    );
  }

  @Interval(60000)
  async sweep() {
    const now = new Date();

    // Find monitors where next expected time has passed
    const overdueMonitors = await this.db
      .select()
      .from(monitors)
      .where(
        and(
          eq(monitors.isPaused, false),
          isNotNull(monitors.nextExpectedAt),
          lt(monitors.nextExpectedAt, now),
          or(
            eq(monitors.status, 'healthy'),
            eq(monitors.status, 'late'),
          ),
        ),
      );

    for (const monitor of overdueMonitors) {
      const graceDeadline = new Date(
        monitor.nextExpectedAt!.getTime() + (monitor.graceSeconds ?? 300) * 1000,
      );

      let newStatus: 'late' | 'down';
      let result: 'late' | 'missed';

      if (now < graceDeadline) {
        newStatus = 'late';
        result = 'late';
      } else {
        newStatus = 'down';
        result = 'missed';
      }

      // Only update if status is changing or getting worse
      if (
        monitor.status === 'healthy' ||
        (monitor.status === 'late' && newStatus === 'down')
      ) {
        const failures = (monitor.consecutiveFailures ?? 0) + 1;

        await this.db
          .update(monitors)
          .set({
            status: newStatus,
            consecutiveFailures: failures,
            updatedAt: new Date(),
          })
          .where(eq(monitors.id, monitor.id));

        // Publish evaluation
        const evaluation: MonitorEvaluation = {
          monitorId: monitor.id,
          result,
          reason: result === 'late' ? 'Ping arrived late' : 'Ping missed',
          expectedAt: monitor.nextExpectedAt?.toISOString() ?? null,
          actualAt: null,
          timestamp: new Date().toISOString(),
        };

        await this.redpanda.publish(
          TOPICS.MONITOR_EVALUATIONS.name,
          monitor.id,
          evaluation,
        );

        // Publish state update
        const stateEvent: MonitorStateEvent = {
          monitorId: monitor.id,
          status: newStatus,
          lastPingAt: monitor.lastPingAt?.toISOString() ?? null,
          nextExpectedAt: monitor.nextExpectedAt?.toISOString() ?? null,
          consecutiveFailures: failures,
          timestamp: new Date().toISOString(),
        };

        await this.redpanda.publish(
          TOPICS.MONITOR_STATE.name,
          monitor.id,
          stateEvent,
        );

        this.logger.warn(
          `Monitor ${monitor.name} (${monitor.id}) is ${newStatus} — ${result}`,
        );
      }
    }
  }

  @Interval(60000)
  async sweepMaxRuntime() {
    const now = new Date();

    // Find monitors with maxRuntimeSeconds set that are healthy
    const monitorsWithMaxRuntime = await this.db
      .select()
      .from(monitors)
      .where(
        and(
          eq(monitors.isPaused, false),
          isNotNull(monitors.maxRuntimeSeconds),
          eq(monitors.status, 'healthy'),
        ),
      );

    for (const monitor of monitorsWithMaxRuntime) {
      // Find the most recent ping
      const [lastPing] = await this.db
        .select()
        .from(pings)
        .where(eq(pings.monitorId, monitor.id))
        .orderBy(desc(pings.createdAt))
        .limit(1);

      // If the last ping is a 'start' with no subsequent success, check runtime
      if (lastPing && lastPing.type === 'start') {
        const runtimeMs = now.getTime() - lastPing.createdAt.getTime();
        const maxMs = monitor.maxRuntimeSeconds! * 1000;

        if (runtimeMs > maxMs) {
          const failures = (monitor.consecutiveFailures ?? 0) + 1;

          await this.db
            .update(monitors)
            .set({
              status: 'down',
              consecutiveFailures: failures,
              updatedAt: now,
            })
            .where(eq(monitors.id, monitor.id));

          const evaluation: MonitorEvaluation = {
            monitorId: monitor.id,
            result: 'failed',
            reason: `Max runtime exceeded (${monitor.maxRuntimeSeconds}s)`,
            expectedAt: null,
            actualAt: null,
            timestamp: now.toISOString(),
          };

          await this.redpanda.publish(
            TOPICS.MONITOR_EVALUATIONS.name,
            monitor.id,
            evaluation,
          );

          this.logger.warn(
            `Monitor ${monitor.name} exceeded max runtime of ${monitor.maxRuntimeSeconds}s`,
          );
        }
      }
    }
  }
}

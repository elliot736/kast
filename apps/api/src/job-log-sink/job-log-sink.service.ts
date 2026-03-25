import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS, CONSUMER_GROUPS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import { jobRunLogs } from '../database/schema';
import type { JobRunLogEvent } from '../redpanda/redpanda.interfaces';

@Injectable()
export class JobLogSinkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobLogSinkService.name);
  private buffer: JobRunLogEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  private static readonly BATCH_SIZE = 50;
  private static readonly FLUSH_INTERVAL_MS = 500;

  constructor(
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
  ) {}

  async onModuleInit() {
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.JOB_LOG_SINK,
      TOPICS.JOB_RUN_LOGS.name,
      async ({ message }) => {
        const event: JobRunLogEvent = JSON.parse(message.value!.toString());
        this.buffer.push(event);
        if (this.buffer.length >= JobLogSinkService.BATCH_SIZE) {
          await this.flush();
        }
      },
    );

    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush().catch((err) =>
          this.logger.error(`Flush failed: ${err}`),
        );
      }
    }, JobLogSinkService.FLUSH_INTERVAL_MS);

    this.logger.log('Job log sink consumer started');
  }

  async onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (this.buffer.length > 0) {
      await this.flush();
    }
  }

  private async flush() {
    const batch = this.buffer.splice(0, JobLogSinkService.BATCH_SIZE);
    if (batch.length === 0) return;

    try {
      await this.db.insert(jobRunLogs).values(
        batch.map((event) => ({
          runId: event.runId,
          level: event.level,
          message: event.message,
          metadata: event.metadata,
          timestamp: new Date(event.timestamp),
        })),
      );
    } catch (err) {
      this.logger.error(`Failed to write ${batch.length} log entries: ${err}`);
      // Put them back at the front
      this.buffer.unshift(...batch);
    }
  }
}

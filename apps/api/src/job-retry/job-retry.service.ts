import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { eq, and, lte } from 'drizzle-orm';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS, CONSUMER_GROUPS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import { jobRuns } from '../database/schema';
import type { JobTriggerEvent } from '../redpanda/redpanda.interfaces';

@Injectable()
export class JobRetryService implements OnModuleInit {
  private readonly logger = new Logger(JobRetryService.name);

  constructor(
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
  ) {}

  async onModuleInit() {
    // We also consume retry events to acknowledge them,
    // but the actual re-trigger is done by the sweep
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.JOB_RETRY,
      TOPICS.JOB_RETRY_SCHEDULED.name,
      async () => {
        // Events are consumed to advance the consumer offset.
        // The actual retry dispatch happens in the sweep below.
      },
    );

    this.logger.log('Job retry consumer started');
  }

  @Interval(5000)
  async sweep() {
    const now = new Date();

    // Find retry runs that are due
    const dueRetries = await this.db
      .select()
      .from(jobRuns)
      .where(
        and(
          eq(jobRuns.status, 'scheduled'),
          eq(jobRuns.trigger, 'retry'),
          lte(jobRuns.scheduledAt, now),
        ),
      );

    for (const run of dueRetries) {
      try {
        const event: JobTriggerEvent = {
          jobId: run.jobId,
          runId: run.id,
          trigger: 'retry',
          scheduledAt: run.scheduledAt.toISOString(),
          timestamp: now.toISOString(),
        };

        await this.redpanda.publish(TOPICS.JOB_TRIGGERS.name, run.jobId, event);

        this.logger.log(`Dispatched retry run ${run.id} for job ${run.jobId} (attempt ${run.attempt})`);
      } catch (err) {
        this.logger.error(`Failed to dispatch retry run ${run.id}: ${err}`);
      }
    }
  }
}

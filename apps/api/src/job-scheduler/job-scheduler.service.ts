import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { eq, and, lte, isNotNull } from 'drizzle-orm';
import { CronExpressionParser } from 'cron-parser';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import { jobs, jobRuns } from '../database/schema';
import type { JobTriggerEvent } from '../redpanda/redpanda.interfaces';

@Injectable()
export class JobSchedulerService {
  private readonly logger = new Logger(JobSchedulerService.name);

  constructor(
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
  ) {}

  @Interval(15000)
  async sweep() {
    const now = new Date();

    const dueJobs = await this.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.status, 'active'),
          isNotNull(jobs.nextRunAt),
          lte(jobs.nextRunAt, now),
        ),
      );

    for (const job of dueJobs) {
      try {
        // Create a scheduled run
        const [run] = await this.db
          .insert(jobRuns)
          .values({
            jobId: job.id,
            trigger: 'cron',
            scheduledAt: job.nextRunAt!,
          })
          .returning();

        // Publish trigger event
        const event: JobTriggerEvent = {
          jobId: job.id,
          runId: run.id,
          trigger: 'cron',
          scheduledAt: job.nextRunAt!.toISOString(),
          timestamp: now.toISOString(),
        };

        await this.redpanda.publish(TOPICS.JOB_TRIGGERS.name, job.id, event);

        // Advance nextRunAt
        const nextRunAt = this.computeNextRunAt(job.schedule, job.timezone);

        await this.db
          .update(jobs)
          .set({
            nextRunAt,
            lastRunAt: now,
            updatedAt: now,
          })
          .where(eq(jobs.id, job.id));

        this.logger.log(`Triggered job ${job.name} (${job.id}), run ${run.id}`);
      } catch (err) {
        this.logger.error(`Failed to trigger job ${job.name} (${job.id}): ${err}`);
      }
    }
  }

  private computeNextRunAt(schedule: string, timezone?: string | null): Date {
    const interval = CronExpressionParser.parse(schedule, {
      tz: timezone ?? 'UTC',
    });
    return interval.next().toDate();
  }
}

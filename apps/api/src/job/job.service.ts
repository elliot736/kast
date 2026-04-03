import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, desc, sql, count, gte } from 'drizzle-orm';
import { CronExpressionParser } from 'cron-parser';
import { DRIZZLE, type Database } from '../database/database.provider';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS } from '../redpanda/redpanda.constants';
import { jobs, jobRuns, jobRunLogs } from '../database/schema';
import type { JobTriggerEvent } from '../redpanda/redpanda.interfaces';
import { CreateJobDto, UpdateJobDto } from './job.dto';

@Injectable()
export class JobService {
  constructor(
    @Inject(DRIZZLE) private db: Database,
    private redpanda: RedpandaService,
  ) {}

  async create(dto: CreateJobDto) {
    const nextRunAt = this.computeNextRunAt(dto.schedule, dto.timezone);

    const [job] = await this.db
      .insert(jobs)
      .values({
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        schedule: dto.schedule,
        timezone: dto.timezone,
        maxRetries: dto.maxRetries,
        retryDelaySeconds: dto.retryDelaySeconds,
        retryBackoffMultiplier: dto.retryBackoffMultiplier,
        retryMaxDelaySeconds: dto.retryMaxDelaySeconds,
        concurrencyLimit: dto.concurrencyLimit,
        concurrencyPolicy: dto.concurrencyPolicy,
        monitorId: dto.monitorId,
        teamId: dto.teamId,
        tags: dto.tags,
        nextRunAt,
      })
      .returning();
    return job;
  }

  async findAll(filters?: { status?: string; tag?: string; teamId?: string }) {
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(jobs.status, filters.status as any));
    }
    if (filters?.teamId) {
      conditions.push(eq(jobs.teamId, filters.teamId));
    }
    if (filters?.tag) {
      conditions.push(sql`${jobs.tags} @> ${JSON.stringify([filters.tag])}::jsonb`);
    }
    if (conditions.length > 0) {
      return this.db.select().from(jobs).where(and(...conditions));
    }
    return this.db.select().from(jobs);
  }

  async findById(id: string) {
    const [job] = await this.db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async update(id: string, dto: UpdateJobDto) {
    const updates: Record<string, any> = { ...dto, updatedAt: new Date() };

    if (dto.schedule || dto.timezone) {
      const current = await this.findById(id);
      const schedule = dto.schedule ?? current.schedule;
      const timezone = dto.timezone ?? current.timezone ?? 'UTC';
      updates.nextRunAt = this.computeNextRunAt(schedule, timezone);
    }

    const [job] = await this.db
      .update(jobs)
      .set(updates)
      .where(eq(jobs.id, id))
      .returning();
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async delete(id: string) {
    const [job] = await this.db
      .delete(jobs)
      .where(eq(jobs.id, id))
      .returning({ id: jobs.id });
    if (!job) throw new NotFoundException('Job not found');
  }

  async pause(id: string) {
    const [job] = await this.db
      .update(jobs)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async resume(id: string) {
    const current = await this.findById(id);
    const nextRunAt = this.computeNextRunAt(current.schedule, current.timezone ?? 'UTC');

    const [job] = await this.db
      .update(jobs)
      .set({ status: 'active', nextRunAt, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async trigger(id: string) {
    const job = await this.findById(id);

    const [run] = await this.db
      .insert(jobRuns)
      .values({
        jobId: job.id,
        trigger: 'manual',
        scheduledAt: new Date(),
      })
      .returning();

    const event: JobTriggerEvent = {
      jobId: job.id,
      runId: run.id,
      trigger: 'manual',
      scheduledAt: run.scheduledAt.toISOString(),
      timestamp: new Date().toISOString(),
    };

    await this.redpanda.publish(TOPICS.JOB_TRIGGERS.name, job.id, event);

    await this.db
      .update(jobs)
      .set({ lastRunAt: new Date(), updatedAt: new Date() })
      .where(eq(jobs.id, job.id));

    return run;
  }

  async getRuns(id: string, filters?: { status?: string; limit?: number; offset?: number }) {
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const conditions = [eq(jobRuns.jobId, id)];
    if (filters?.status) {
      conditions.push(eq(jobRuns.status, filters.status as any));
    }

    return this.db
      .select()
      .from(jobRuns)
      .where(and(...conditions))
      .orderBy(desc(jobRuns.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getRunById(jobId: string, runId: string) {
    const [run] = await this.db
      .select()
      .from(jobRuns)
      .where(and(eq(jobRuns.id, runId), eq(jobRuns.jobId, jobId)))
      .limit(1);
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  async getRunLogs(runId: string, filters?: { level?: string; limit?: number; offset?: number }) {
    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;

    const conditions = [eq(jobRunLogs.runId, runId)];
    if (filters?.level) {
      conditions.push(eq(jobRunLogs.level, filters.level));
    }

    return this.db
      .select()
      .from(jobRunLogs)
      .where(and(...conditions))
      .orderBy(jobRunLogs.timestamp)
      .limit(limit)
      .offset(offset);
  }

  async cancelRun(jobId: string, runId: string) {
    const [run] = await this.db
      .update(jobRuns)
      .set({
        status: 'cancelled',
        finishedAt: new Date(),
        errorMessage: 'Cancelled by user',
      })
      .where(
        and(
          eq(jobRuns.id, runId),
          eq(jobRuns.jobId, jobId),
        ),
      )
      .returning();
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  async getStats(id: string) {
    const job = await this.findById(id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const [runStats] = await this.db
      .select({
        total: count(),
        successes: count(sql`CASE WHEN ${jobRuns.status} = 'success' THEN 1 END`),
        failures: count(sql`CASE WHEN ${jobRuns.status} = 'failed' THEN 1 END`),
        timeouts: count(sql`CASE WHEN ${jobRuns.status} = 'timeout' THEN 1 END`),
        retries: count(sql`CASE WHEN ${jobRuns.trigger} = 'retry' THEN 1 END`),
        avgDuration: sql<number>`avg(${jobRuns.durationMs})`,
      })
      .from(jobRuns)
      .where(
        and(
          eq(jobRuns.jobId, id),
          gte(jobRuns.createdAt, thirtyDaysAgo),
        ),
      );

    const total = Number(runStats?.total ?? 0);
    const successes = Number(runStats?.successes ?? 0);

    return {
      jobId: id,
      period: '30d',
      runs: {
        total,
        successes,
        failures: Number(runStats?.failures ?? 0),
        timeouts: Number(runStats?.timeouts ?? 0),
        retries: Number(runStats?.retries ?? 0),
        successRate: total > 0 ? Math.round((successes / total) * 10000) / 100 : 100,
      },
      avgDurationMs: runStats?.avgDuration ? Math.round(Number(runStats.avgDuration)) : null,
      status: job.status,
    };
  }

  private computeNextRunAt(schedule: string, timezone?: string | null): Date {
    try {
      const interval = CronExpressionParser.parse(schedule, {
        tz: timezone ?? 'UTC',
      });
      return interval.next().toDate();
    } catch {
      throw new BadRequestException(
        `Invalid cron schedule "${schedule}": no matching future date found`,
      );
    }
  }
}

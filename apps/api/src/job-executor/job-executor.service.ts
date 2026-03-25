import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { eq, and, count, desc, isNotNull, lt } from 'drizzle-orm';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS, CONSUMER_GROUPS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import { jobs, jobRuns, workflows, workflowRuns } from '../database/schema';
import type {
  JobTriggerEvent,
  JobResultEvent,
  JobRetryEvent,
  JobRunLogEvent,
  WorkflowResumeEvent,
} from '../redpanda/redpanda.interfaces';

@Injectable()
export class JobExecutorService implements OnModuleInit {
  private readonly logger = new Logger(JobExecutorService.name);

  constructor(
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
  ) {}

  async onModuleInit() {
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.JOB_EXECUTOR,
      TOPICS.JOB_TRIGGERS.name,
      async ({ message }) => {
        const event: JobTriggerEvent = JSON.parse(message.value!.toString());
        await this.execute(event);
      },
    );

    this.logger.log('Job executor consumer started');
  }

  private async emitLog(
    jobId: string,
    runId: string,
    level: JobRunLogEvent['level'],
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    const logEvent: JobRunLogEvent = {
      runId,
      jobId,
      level,
      message,
      metadata,
      timestamp: new Date().toISOString(),
    };
    await this.redpanda.publish(TOPICS.JOB_RUN_LOGS.name, runId, logEvent);
  }

  private async checkConcurrency(
    job: typeof jobs.$inferSelect,
    runId: string,
  ): Promise<boolean> {
    const limit = job.concurrencyLimit ?? 1;
    const policy = job.concurrencyPolicy ?? 'queue';

    const [{ runningCount }] = await this.db
      .select({ runningCount: count() })
      .from(jobRuns)
      .where(
        and(
          eq(jobRuns.jobId, job.id),
          eq(jobRuns.status, 'running'),
        ),
      );

    if (Number(runningCount) < limit) return true;

    await this.emitLog(job.id, runId, 'warn', `Concurrency limit reached (${limit})`, {
      policy,
      runningCount: Number(runningCount),
    });

    if (policy === 'skip') {
      await this.db
        .update(jobRuns)
        .set({ status: 'cancelled', errorMessage: 'Skipped: concurrency limit reached' })
        .where(eq(jobRuns.id, runId));
      return false;
    }

    if (policy === 'cancel') {
      // Cancel the oldest running run
      const [oldest] = await this.db
        .select({ id: jobRuns.id })
        .from(jobRuns)
        .where(
          and(
            eq(jobRuns.jobId, job.id),
            eq(jobRuns.status, 'running'),
          ),
        )
        .orderBy(jobRuns.startedAt)
        .limit(1);

      if (oldest) {
        await this.db
          .update(jobRuns)
          .set({
            status: 'cancelled',
            finishedAt: new Date(),
            errorMessage: 'Cancelled: newer run took its slot',
          })
          .where(eq(jobRuns.id, oldest.id));
        await this.emitLog(job.id, oldest.id, 'warn', 'Run cancelled due to concurrency policy');
      }
      return true;
    }

    // policy === 'queue': mark as queued and wait (the run stays as 'scheduled')
    await this.db
      .update(jobRuns)
      .set({ queuedAt: new Date() })
      .where(eq(jobRuns.id, runId));
    await this.emitLog(job.id, runId, 'info', 'Run queued, waiting for concurrency slot');
    return false;
  }

  private async execute(event: JobTriggerEvent) {
    const [job] = await this.db
      .select()
      .from(jobs)
      .where(eq(jobs.id, event.jobId))
      .limit(1);

    if (!job) {
      this.logger.warn(`Job ${event.jobId} not found, skipping run ${event.runId}`);
      return;
    }

    // Concurrency check
    const canRun = await this.checkConcurrency(job, event.runId);
    if (!canRun) return;

    // Check if this job has a workflow — delegate to workflow engine
    const [workflow] = await this.db
      .select()
      .from(workflows)
      .where(eq(workflows.jobId, job.id))
      .orderBy(desc(workflows.version))
      .limit(1);

    if (workflow) {
      await this.delegateToWorkflow(job, event, workflow);
      return;
    }

    await this.emitLog(job.id, event.runId, 'info', 'Execution started', {
      url: job.url,
      method: job.method,
      trigger: event.trigger,
    });

    // Mark run as running
    const startedAt = new Date();
    await this.db
      .update(jobRuns)
      .set({ status: 'running', startedAt })
      .where(eq(jobRuns.id, event.runId));

    let status: 'success' | 'failed' | 'timeout' = 'failed';
    let httpStatus: number | undefined;
    let responseBody: string | undefined;
    let errorMessage: string | undefined;

    const successCodes = (job.successStatusCodes as number[] | null) ?? [200, 201, 202, 204];

    try {
      // Interpolate body template
      const body = job.body
        ?.replace('{{run_id}}', event.runId)
        .replace('{{scheduled_at}}', event.scheduledAt);

      const controller = new AbortController();
      const timeoutMs = (job.timeoutSeconds ?? 30) * 1000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      await this.emitLog(job.id, event.runId, 'debug', `Sending ${job.method ?? 'POST'} request to ${job.url}`);

      try {
        const res = await fetch(job.url, {
          method: job.method ?? 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Kast/1.0',
            ...(job.headers as Record<string, string>),
          },
          body: job.method !== 'GET' ? body : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        httpStatus = res.status;

        const text = await res.text();
        responseBody = text.slice(0, 65536);

        if (successCodes.includes(res.status)) {
          status = 'success';
          await this.emitLog(job.id, event.runId, 'info', `HTTP ${res.status} — success`);
        } else {
          status = 'failed';
          errorMessage = `HTTP ${res.status}: ${responseBody.slice(0, 500)}`;
          await this.emitLog(job.id, event.runId, 'error', `HTTP ${res.status} — not in successStatusCodes`, {
            httpStatus: res.status,
            successCodes,
          });
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          status = 'timeout';
          errorMessage = `Request timed out after ${job.timeoutSeconds}s`;
          await this.emitLog(job.id, event.runId, 'error', errorMessage);
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      status = 'failed';
      errorMessage = err.message ?? String(err);
      await this.emitLog(job.id, event.runId, 'error', `Request failed: ${errorMessage}`);
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    // Update run
    await this.db
      .update(jobRuns)
      .set({
        status,
        finishedAt,
        durationMs,
        httpStatus,
        responseBody,
        errorMessage,
      })
      .where(eq(jobRuns.id, event.runId));

    // Publish result event
    const result: JobResultEvent = {
      jobId: job.id,
      runId: event.runId,
      status,
      httpStatus,
      durationMs,
      errorMessage,
      timestamp: finishedAt.toISOString(),
    };

    await this.redpanda.publish(TOPICS.JOB_RESULTS.name, job.id, result);

    await this.emitLog(job.id, event.runId, 'info', `Execution completed: ${status} (${durationMs}ms)`);

    // Handle retries on failure
    if (status !== 'success') {
      await this.scheduleRetry(job, event);
    }

    this.logger.log(
      `Job ${job.name} run ${event.runId} completed: ${status} (${durationMs}ms)`,
    );
  }

  private async delegateToWorkflow(
    job: typeof jobs.$inferSelect,
    event: JobTriggerEvent,
    workflow: typeof workflows.$inferSelect,
  ) {
    await this.emitLog(job.id, event.runId, 'info', `Delegating to workflow v${workflow.version}`, {
      workflowId: workflow.id,
    });

    // Mark run as running
    const startedAt = new Date();
    await this.db
      .update(jobRuns)
      .set({ status: 'running', startedAt })
      .where(eq(jobRuns.id, event.runId));

    // Create a workflow run
    const [wfRun] = await this.db
      .insert(workflowRuns)
      .values({
        workflowId: workflow.id,
        jobRunId: event.runId,
        status: 'running',
        currentStepIndex: 0,
        context: {},
      })
      .returning();

    // Publish resume event to kick off the engine
    const resumeEvent: WorkflowResumeEvent = {
      workflowRunId: wfRun.id,
      reason: 'initial',
      timestamp: startedAt.toISOString(),
    };

    await this.redpanda.publish(TOPICS.WORKFLOW_RESUME.name, wfRun.id, resumeEvent);

    this.logger.log(`Delegated job ${job.name} run ${event.runId} to workflow engine (run ${wfRun.id})`);
  }

  private async scheduleRetry(
    job: typeof jobs.$inferSelect,
    event: JobTriggerEvent,
  ) {
    const maxRetries = job.maxRetries ?? 0;
    if (maxRetries <= 0) return;

    // Get the current run to check attempt number
    const [currentRun] = await this.db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.id, event.runId))
      .limit(1);

    if (!currentRun) return;

    const attempt = currentRun.attempt ?? 1;
    if (attempt > maxRetries) {
      await this.emitLog(job.id, event.runId, 'warn', `Max retries reached (${maxRetries}), not retrying`);
      return;
    }

    const baseDelay = (job.retryDelaySeconds ?? 60) * 1000;
    const multiplier = job.retryBackoffMultiplier ?? 2;
    const maxDelay = (job.retryMaxDelaySeconds ?? 3600) * 1000;
    const delayMs = Math.min(baseDelay * Math.pow(multiplier, attempt - 1), maxDelay);
    const scheduledAt = new Date(Date.now() + delayMs);

    // Create a new run for the retry
    const [retryRun] = await this.db
      .insert(jobRuns)
      .values({
        jobId: job.id,
        trigger: 'retry',
        scheduledAt,
        attempt: attempt + 1,
        parentRunId: event.runId,
      })
      .returning();

    const retryEvent: JobRetryEvent = {
      jobId: job.id,
      originalRunId: event.runId,
      newRunId: retryRun.id,
      attempt: attempt + 1,
      delayMs,
      scheduledAt: scheduledAt.toISOString(),
      timestamp: new Date().toISOString(),
    };

    await this.redpanda.publish(TOPICS.JOB_RETRY_SCHEDULED.name, job.id, retryEvent);

    await this.emitLog(job.id, event.runId, 'info', `Retry ${attempt + 1}/${maxRetries} scheduled in ${Math.round(delayMs / 1000)}s`, {
      retryRunId: retryRun.id,
      delayMs,
    });
  }

  /**
   * Sweep for queued runs that can now execute because
   * the concurrency slot opened up.
   */
  @Interval(5000)
  async sweepQueuedRuns() {
    // Find all runs that were queued (have queuedAt set, still scheduled)
    const queuedRuns = await this.db
      .select()
      .from(jobRuns)
      .where(
        and(
          eq(jobRuns.status, 'scheduled'),
          isNotNull(jobRuns.queuedAt),
        ),
      )
      .orderBy(jobRuns.queuedAt);

    for (const run of queuedRuns) {
      // Check if a slot is available for this job
      const [job] = await this.db
        .select()
        .from(jobs)
        .where(eq(jobs.id, run.jobId))
        .limit(1);

      if (!job) continue;

      const limit = job.concurrencyLimit ?? 1;
      const [{ runningCount }] = await this.db
        .select({ runningCount: count() })
        .from(jobRuns)
        .where(
          and(
            eq(jobRuns.jobId, job.id),
            eq(jobRuns.status, 'running'),
          ),
        );

      if (Number(runningCount) >= limit) continue;

      // Slot available — dispatch this queued run
      const event: JobTriggerEvent = {
        jobId: run.jobId,
        runId: run.id,
        trigger: run.trigger as any,
        scheduledAt: run.scheduledAt.toISOString(),
        timestamp: new Date().toISOString(),
      };

      // Clear queuedAt so it's not picked up again by the sweep
      await this.db
        .update(jobRuns)
        .set({ queuedAt: null })
        .where(eq(jobRuns.id, run.id));

      await this.redpanda.publish(TOPICS.JOB_TRIGGERS.name, run.jobId, event);

      this.logger.log(`Dispatched queued run ${run.id} for job ${job.name}`);
    }
  }
}

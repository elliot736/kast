import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { eq, and, lte } from 'drizzle-orm';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS, CONSUMER_GROUPS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import { workflowRuns, workflowStepResults, workflowSignals } from '../database/schema';
import type { WorkflowSignalEvent, WorkflowResumeEvent } from '../redpanda/redpanda.interfaces';

@Injectable()
export class WorkflowEventMatcherService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowEventMatcherService.name);

  constructor(
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
  ) {}

  async onModuleInit() {
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.WORKFLOW_SIGNAL_DELIVERY,
      TOPICS.WORKFLOW_SIGNALS.name,
      async ({ message }) => {
        let signal: WorkflowSignalEvent;
        try {
          signal = JSON.parse(message.value!.toString());
        } catch {
          this.logger.warn('Skipping malformed Kafka message');
          return;
        }
        await this.deliverSignal(signal);
      },
    );
    this.logger.log('Workflow signal delivery consumer started');
  }

  private async deliverSignal(signal: WorkflowSignalEvent) {
    // Check if target run is currently waiting
    const [targetRun] = await this.db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, signal.targetRunId), eq(workflowRuns.status, 'waiting')))
      .limit(1);

    if (!targetRun) {
      // Not waiting — signal is already in DB from the sender. Nothing to do.
      this.logger.debug(`Signal for ${signal.targetRunId} — target not waiting, buffered in DB`);
      return;
    }

    // Target IS waiting — deliver the signal
    // Mark signal as delivered in DB
    await this.db
      .update(workflowSignals)
      .set({ delivered: true, deliveredAt: new Date() })
      .where(
        and(
          eq(workflowSignals.targetRunId, signal.targetRunId),
          eq(workflowSignals.delivered, false),
        ),
      );

    // Record wait step as completed
    const stepId = targetRun.currentStepId ?? `__wait_${targetRun.currentStepIndex ?? 0}`;
    const stepIndex = targetRun.currentStepIndex ?? 0;
    await this.db.insert(workflowStepResults).values({
      workflowRunId: targetRun.id,
      stepId,
      stepIndex,
      status: 'completed',
      output: { signal: signal.payload, sourceRunId: signal.sourceRunId },
      startedAt: targetRun.startedAt,
      finishedAt: new Date(),
    });

    // Reset wait state and resume
    await this.db
      .update(workflowRuns)
      .set({
        status: 'running',
        waitTimeoutAt: null,
        waitingForChildRunId: null,
      })
      .where(eq(workflowRuns.id, targetRun.id));

    const resumeEvent: WorkflowResumeEvent = {
      workflowRunId: targetRun.id,
      reason: 'signal_received',
      signalPayload: signal.payload,
      timestamp: new Date().toISOString(),
    };
    await this.redpanda.publish(TOPICS.WORKFLOW_RESUME.name, targetRun.id, resumeEvent);

    this.logger.log(`Delivered signal to workflow run ${targetRun.id}`);
  }

  @Interval(30000)
  async sweepTimeouts() {
    const now = new Date();

    const timedOut = await this.db
      .select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.status, 'waiting'),
          lte(workflowRuns.waitTimeoutAt, now),
        ),
      );

    for (const run of timedOut) {
      try {
        const stepIndex = run.currentStepIndex ?? 0;
        await this.db.insert(workflowStepResults).values({
          workflowRunId: run.id,
          stepId: `__wait_${stepIndex}`,
          stepIndex,
          status: 'failed',
          errorMessage: 'Signal wait timed out',
          startedAt: run.startedAt,
          finishedAt: now,
        });

        await this.db
          .update(workflowRuns)
          .set({
            status: 'failed',
            finishedAt: now,
            waitTimeoutAt: null,
          })
          .where(eq(workflowRuns.id, run.id));

        this.logger.warn(`Workflow run ${run.id} timed out waiting for signal`);
      } catch (err) {
        this.logger.error(`Failed to timeout workflow run ${run.id}: ${err}`);
      }
    }
  }
}

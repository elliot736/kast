import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS, CONSUMER_GROUPS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import {
  workflows,
  workflowRuns,
  workflowStepResults,
  workflowSignals,
  jobRuns,
} from '../database/schema';
import type {
  WorkflowResumeEvent,
  WorkflowSignalEvent,
  WorkflowStepResultEvent,
  JobResultEvent,
  JobRunLogEvent,
} from '../redpanda/redpanda.interfaces';
import type {
  WorkflowStepDefinition,
  FanOutStepConfig,
  RunStepConfig,
  SleepStepConfig,
  SpawnStepConfig,
  SignalParentStepConfig,
  SignalChildStepConfig,
  WaitForSignalStepConfig,
} from '../workflow/workflow.types';

@Injectable()
export class WorkflowEngineService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
  ) {}

  async onModuleInit() {
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.WORKFLOW_ENGINE,
      TOPICS.WORKFLOW_RESUME.name,
      async ({ message }) => {
        const event: WorkflowResumeEvent = JSON.parse(message.value!.toString());
        await this.replay(event);
      },
    );

    this.logger.log('Workflow engine consumer started');
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

  private async emitStepResult(
    workflowRunId: string,
    jobId: string,
    stepId: string,
    stepIndex: number,
    status: 'completed' | 'failed' | 'skipped',
    durationMs?: number,
  ) {
    const event: WorkflowStepResultEvent = {
      workflowRunId,
      jobId,
      stepId,
      stepIndex,
      status,
      durationMs,
      timestamp: new Date().toISOString(),
    };
    await this.redpanda.publish(TOPICS.WORKFLOW_STEP_RESULTS.name, workflowRunId, event);
  }

  private async replay(event: WorkflowResumeEvent) {
    // Load the workflow run
    const [wfRun] = await this.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, event.workflowRunId))
      .limit(1);

    if (!wfRun || wfRun.status === 'completed' || wfRun.status === 'cancelled' || wfRun.status === 'failed') {
      return;
    }

    // Load the workflow definition
    const [workflow] = await this.db
      .select()
      .from(workflows)
      .where(eq(workflows.id, wfRun.workflowId))
      .limit(1);

    if (!workflow) {
      this.logger.error(`Workflow ${wfRun.workflowId} not found for run ${wfRun.id}`);
      return;
    }

    // Load the job run to get jobId
    const [jobRun] = await this.db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.id, wfRun.jobRunId))
      .limit(1);

    if (!jobRun) return;

    const steps = workflow.steps as WorkflowStepDefinition[];

    // Load all existing step results (memoized)
    const existingResults = await this.db
      .select()
      .from(workflowStepResults)
      .where(eq(workflowStepResults.workflowRunId, wfRun.id))
      .orderBy(workflowStepResults.stepIndex);

    const resultMap = new Map(existingResults.map((r) => [r.stepIndex, r]));
    let context: Record<string, unknown> = (wfRun.context as Record<string, unknown>) ?? {};

    // If resuming from signal, inject the signal payload into context
    if (event.reason === 'signal_received' && event.signalPayload) {
      context.__lastSignal = event.signalPayload;
    }

    // If resuming from child completion, inject child result into context
    if (event.reason === 'child_completed' && event.signalPayload) {
      context.__lastSignal = event.signalPayload;
    }

    // Replay loop
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const existing = resultMap.get(i);

      // Memoize: skip completed steps
      if (existing) {
        if (existing.status === 'completed' && existing.output) {
          context[step.id] = existing.output;
        }
        continue;
      }

      // Execute this step
      await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', `Executing step: ${step.name} (${step.type})`, {
        stepId: step.id,
        stepIndex: i,
      });

      const startedAt = new Date();

      try {
        switch (step.type) {
          case 'run': {
            const result = await this.executeRunStep(step.config as RunStepConfig, context);
            const finishedAt = new Date();

            await this.db.insert(workflowStepResults).values({
              workflowRunId: wfRun.id,
              stepId: step.id,
              stepIndex: i,
              status: 'completed',
              output: result,
              durationMs: finishedAt.getTime() - startedAt.getTime(),
              startedAt,
              finishedAt,
            });

            context[step.id] = result;
            await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', `Step ${step.name} completed`);
            await this.emitStepResult(wfRun.id, jobRun.jobId, step.id, i, 'completed', finishedAt.getTime() - startedAt.getTime());
            break;
          }

          case 'sleep': {
            const config = step.config as SleepStepConfig;
            const resumeAt = this.parseDuration(config.duration);

            await this.db
              .update(workflowRuns)
              .set({
                status: 'sleeping',
                currentStepIndex: i,
                context,
                resumeAt,
              })
              .where(eq(workflowRuns.id, wfRun.id));

            // Record step as completed (the sleep itself is the action)
            await this.db.insert(workflowStepResults).values({
              workflowRunId: wfRun.id,
              stepId: step.id,
              stepIndex: i,
              status: 'completed',
              output: { resumeAt: resumeAt.toISOString() },
              durationMs: 0,
              startedAt,
              finishedAt: startedAt,
            });

            await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', `Sleeping until ${resumeAt.toISOString()}`);
            return; // Stop processing — sleeper will resume us
          }

          case 'spawn': {
            const config = step.config as SpawnStepConfig;

            // 1. Find latest workflow for targetJobId
            const [targetWorkflow] = await this.db
              .select()
              .from(workflows)
              .where(eq(workflows.jobId, config.targetJobId))
              .orderBy(desc(workflows.version))
              .limit(1);

            if (!targetWorkflow) {
              throw new Error(`No workflow found for job ${config.targetJobId}`);
            }

            // 2. Create job run for child
            const [childJobRun] = await this.db
              .insert(jobRuns)
              .values({
                jobId: config.targetJobId,
                trigger: 'retry',
                scheduledAt: new Date(),
              })
              .returning();

            // 3. Create workflow run for child
            const [childWfRun] = await this.db
              .insert(workflowRuns)
              .values({
                workflowId: targetWorkflow.id,
                jobRunId: childJobRun.id,
                status: 'running',
                currentStepIndex: 0,
                context: config.input ?? {},
              })
              .returning();

            // 4. Publish resume to start child
            await this.redpanda.publish(TOPICS.WORKFLOW_RESUME.name, childWfRun.id, {
              workflowRunId: childWfRun.id,
              reason: 'initial',
              timestamp: new Date().toISOString(),
            });

            // 5. Record step result
            const output = { childRunId: childWfRun.id, childJobRunId: childJobRun.id };
            await this.db.insert(workflowStepResults).values({
              workflowRunId: wfRun.id,
              stepId: step.id,
              stepIndex: i,
              status: 'completed',
              output,
              durationMs: new Date().getTime() - startedAt.getTime(),
              startedAt,
              finishedAt: new Date(),
            });
            context[step.id] = output;

            // 6. If waitForCompletion, pause parent
            if (config.waitForCompletion) {
              await this.db
                .update(workflowRuns)
                .set({
                  status: 'waiting',
                  currentStepIndex: i,
                  context,
                  waitingForChildRunId: childWfRun.id,
                })
                .where(eq(workflowRuns.id, wfRun.id));

              await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', `Spawned child workflow, waiting for completion`);
              return; // Stop — sleeper will resume when child completes
            }

            await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', `Spawned child workflow (fire-and-forget)`);
            await this.emitStepResult(wfRun.id, jobRun.jobId, step.id, i, 'completed');
            break;
          }

          case 'signal_parent': {
            const config = step.config as SignalParentStepConfig;

            // Find parent: look up jobRun.parentRunId → find parent's workflow run
            const parentJobRunId = (jobRun as any).parentRunId;

            if (!parentJobRunId) {
              await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'warn', 'No parent run to signal');

              // Record as completed (no-op)
              const finishedAt = new Date();
              await this.db.insert(workflowStepResults).values({
                workflowRunId: wfRun.id,
                stepId: step.id,
                stepIndex: i,
                status: 'completed',
                output: { signaled: false, reason: 'no_parent' },
                durationMs: finishedAt.getTime() - startedAt.getTime(),
                startedAt,
                finishedAt,
              });
              context[step.id] = { signaled: false, reason: 'no_parent' };
              break;
            }

            // Find parent's workflow run
            const [parentWfRun] = await this.db
              .select()
              .from(workflowRuns)
              .where(eq(workflowRuns.jobRunId, parentJobRunId))
              .limit(1);

            if (parentWfRun) {
              // Write to signal buffer
              await this.db.insert(workflowSignals).values({
                targetRunId: parentWfRun.id,
                sourceRunId: wfRun.id,
                sourceStepId: step.id,
                payload: config.payload ?? {},
              });

              // Publish to Kafka for real-time delivery
              const signalEvent: WorkflowSignalEvent = {
                targetRunId: parentWfRun.id,
                sourceRunId: wfRun.id,
                sourceStepId: step.id,
                payload: config.payload ?? {},
                timestamp: new Date().toISOString(),
              };
              await this.redpanda.publish(TOPICS.WORKFLOW_SIGNALS.name, parentWfRun.id, signalEvent);
            }

            // Record step result
            const finishedAt = new Date();
            await this.db.insert(workflowStepResults).values({
              workflowRunId: wfRun.id,
              stepId: step.id,
              stepIndex: i,
              status: 'completed',
              output: { signaled: !!parentWfRun, targetRunId: parentWfRun?.id },
              durationMs: finishedAt.getTime() - startedAt.getTime(),
              startedAt,
              finishedAt,
            });
            context[step.id] = { signaled: !!parentWfRun, targetRunId: parentWfRun?.id };

            await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', `Signaled parent workflow`);
            await this.emitStepResult(wfRun.id, jobRun.jobId, step.id, i, 'completed');
            break;
          }

          case 'signal_child': {
            const config = step.config as SignalChildStepConfig;

            // Look up child run ID from context (set by spawn step)
            const spawnOutput = context[config.spawnStepId] as { childRunId?: string } | undefined;
            if (!spawnOutput?.childRunId) {
              throw new Error(`Spawn step "${config.spawnStepId}" not found in context`);
            }

            // Write signal + publish
            await this.db.insert(workflowSignals).values({
              targetRunId: spawnOutput.childRunId,
              sourceRunId: wfRun.id,
              sourceStepId: step.id,
              payload: config.payload ?? {},
            });

            const signalEvent: WorkflowSignalEvent = {
              targetRunId: spawnOutput.childRunId,
              sourceRunId: wfRun.id,
              sourceStepId: step.id,
              payload: config.payload ?? {},
              timestamp: new Date().toISOString(),
            };
            await this.redpanda.publish(TOPICS.WORKFLOW_SIGNALS.name, spawnOutput.childRunId, signalEvent);

            // Record step result
            const finishedAt = new Date();
            await this.db.insert(workflowStepResults).values({
              workflowRunId: wfRun.id,
              stepId: step.id,
              stepIndex: i,
              status: 'completed',
              output: { signaledChildRunId: spawnOutput.childRunId },
              durationMs: finishedAt.getTime() - startedAt.getTime(),
              startedAt,
              finishedAt,
            });
            context[step.id] = { signaledChildRunId: spawnOutput.childRunId };

            await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', `Signaled child workflow ${spawnOutput.childRunId}`);
            await this.emitStepResult(wfRun.id, jobRun.jobId, step.id, i, 'completed');
            break;
          }

          case 'wait_for_signal': {
            const config = step.config as WaitForSignalStepConfig;

            // CHECK BUFFER FIRST — look for undelivered signals in DB
            const [pendingSignal] = await this.db
              .select()
              .from(workflowSignals)
              .where(
                and(
                  eq(workflowSignals.targetRunId, wfRun.id),
                  eq(workflowSignals.delivered, false),
                ),
              )
              .orderBy(workflowSignals.createdAt)
              .limit(1);

            if (pendingSignal) {
              // Signal already buffered — deliver immediately
              await this.db
                .update(workflowSignals)
                .set({ delivered: true, deliveredAt: new Date() })
                .where(eq(workflowSignals.id, pendingSignal.id));

              const finishedAt = new Date();
              await this.db.insert(workflowStepResults).values({
                workflowRunId: wfRun.id,
                stepId: step.id,
                stepIndex: i,
                status: 'completed',
                output: { signal: pendingSignal.payload, sourceRunId: pendingSignal.sourceRunId },
                durationMs: 0,
                startedAt,
                finishedAt,
              });
              context[step.id] = { signal: pendingSignal.payload, sourceRunId: pendingSignal.sourceRunId };

              await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', 'Signal found in buffer, continuing');
              await this.emitStepResult(wfRun.id, jobRun.jobId, step.id, i, 'completed');
              break; // Continue to next step
            }

            // No buffered signal — wait
            const waitTimeoutAt = config.timeoutDuration
              ? this.parseDuration(config.timeoutDuration)
              : null;

            await this.db
              .update(workflowRuns)
              .set({
                status: 'waiting',
                currentStepIndex: i,
                context,
                waitTimeoutAt,
              })
              .where(eq(workflowRuns.id, wfRun.id));

            await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', 'Waiting for signal...');
            return; // Stop — signal delivery consumer will resume
          }

          case 'fan_out': {
            const config = step.config as FanOutStepConfig;
            const branches = config.branches;
            const concurrency = config.concurrency ?? branches.length;
            const failFast = config.failFast ?? false;

            await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info',
              `Fan-out: executing ${branches.length} branches (concurrency: ${concurrency})`,
            );

            const branchResults: Record<string, { status: string; output?: unknown; error?: string; durationMs: number }> = {};
            let aborted = false;

            // Execute branches with concurrency limit
            const queue = [...branches];
            const executing = new Set<Promise<void>>();

            const runBranch = async (branch: typeof branches[number]) => {
              if (aborted) return;
              const branchStart = new Date();
              try {
                const result = await this.executeRunStep(branch.config, context);
                branchResults[branch.id] = {
                  status: 'completed',
                  output: result,
                  durationMs: new Date().getTime() - branchStart.getTime(),
                };
                await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info',
                  `Fan-out branch "${branch.name}" completed`,
                );
              } catch (branchErr: any) {
                branchResults[branch.id] = {
                  status: 'failed',
                  error: branchErr.message ?? String(branchErr),
                  durationMs: new Date().getTime() - branchStart.getTime(),
                };
                await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'error',
                  `Fan-out branch "${branch.name}" failed: ${branchErr.message}`,
                );
                if (failFast) {
                  aborted = true;
                }
              }
            };

            while (queue.length > 0 || executing.size > 0) {
              while (queue.length > 0 && executing.size < concurrency && !aborted) {
                const branch = queue.shift()!;
                const promise = runBranch(branch).then(() => {
                  executing.delete(promise);
                });
                executing.add(promise);
              }
              if (executing.size > 0) {
                await Promise.race(executing);
              }
            }

            const finishedAt = new Date();
            const failedBranches = Object.entries(branchResults).filter(([, r]) => r.status === 'failed');
            const allSucceeded = failedBranches.length === 0;

            const output = {
              branches: branchResults,
              totalBranches: branches.length,
              succeeded: Object.values(branchResults).filter((r) => r.status === 'completed').length,
              failed: failedBranches.length,
            };

            await this.db.insert(workflowStepResults).values({
              workflowRunId: wfRun.id,
              stepId: step.id,
              stepIndex: i,
              status: allSucceeded ? 'completed' : 'failed',
              output,
              errorMessage: allSucceeded ? undefined : `${failedBranches.length} branch(es) failed`,
              durationMs: finishedAt.getTime() - startedAt.getTime(),
              startedAt,
              finishedAt,
            });

            context[step.id] = output;

            if (!allSucceeded) {
              // Treat fan-out failure like a step failure — defer to onFailure
              throw new Error(`${failedBranches.length}/${branches.length} fan-out branches failed`);
            }

            await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info',
              `Fan-out completed: ${output.succeeded}/${output.totalBranches} branches succeeded`,
            );
            await this.emitStepResult(wfRun.id, jobRun.jobId, step.id, i, 'completed', finishedAt.getTime() - startedAt.getTime());
            break;
          }
        }
      } catch (err: any) {
        const finishedAt = new Date();
        const errorMessage = err.message ?? String(err);

        await this.db.insert(workflowStepResults).values({
          workflowRunId: wfRun.id,
          stepId: step.id,
          stepIndex: i,
          status: 'failed',
          errorMessage,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          startedAt,
          finishedAt,
        });

        await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'error', `Step ${step.name} failed: ${errorMessage}`);
        await this.emitStepResult(wfRun.id, jobRun.jobId, step.id, i, 'failed', finishedAt.getTime() - startedAt.getTime());

        const onFailure = step.onFailure ?? 'abort';

        if (onFailure === 'abort') {
          await this.db
            .update(workflowRuns)
            .set({ status: 'failed', finishedAt, context })
            .where(eq(workflowRuns.id, wfRun.id));

          await this.publishJobResult(jobRun, 'failed', errorMessage, startedAt);
          return;
        }

        if (onFailure === 'continue') {
          continue;
        }

        if (onFailure === 'goto' && step.onFailureGoto) {
          const gotoIndex = steps.findIndex((s) => s.id === step.onFailureGoto);
          if (gotoIndex >= 0) {
            // Update context and jump — we'll need to restart the loop
            // For simplicity, we recursively resume from the new position
            await this.db
              .update(workflowRuns)
              .set({ currentStepIndex: gotoIndex, context })
              .where(eq(workflowRuns.id, wfRun.id));

            const resumeEvent: WorkflowResumeEvent = {
              workflowRunId: wfRun.id,
              reason: 'retry',
              timestamp: new Date().toISOString(),
            };
            await this.redpanda.publish(TOPICS.WORKFLOW_RESUME.name, wfRun.id, resumeEvent);
            return;
          }
          // If goto target not found, abort
          await this.db
            .update(workflowRuns)
            .set({ status: 'failed', finishedAt, context })
            .where(eq(workflowRuns.id, wfRun.id));
          await this.publishJobResult(jobRun, 'failed', `Goto target "${step.onFailureGoto}" not found`, startedAt);
          return;
        }
      }
    }

    // All steps completed
    const finishedAt = new Date();
    await this.db
      .update(workflowRuns)
      .set({ status: 'completed', finishedAt, context })
      .where(eq(workflowRuns.id, wfRun.id));

    await this.publishJobResult(jobRun, 'success', undefined, wfRun.startedAt ?? finishedAt);
    await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', 'Workflow completed successfully');
  }

  private async executeRunStep(
    config: RunStepConfig,
    context: Record<string, unknown>,
  ): Promise<unknown> {
    const body = config.body
      ? this.interpolateString(config.body, context)
      : undefined;

    const controller = new AbortController();
    const timeoutMs = (config.timeoutSeconds ?? 30) * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(config.url, {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kast-Workflow/1.0',
          ...(config.headers ?? {}),
        },
        body: config.method !== 'GET' ? body : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const successCodes = config.successStatusCodes ?? [200, 201, 202, 204];
      const text = await res.text();

      if (!successCodes.includes(res.status)) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
      }

      try {
        return JSON.parse(text);
      } catch {
        return { body: text.slice(0, 65536), status: res.status };
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${config.timeoutSeconds ?? 30}s`);
      }
      throw err;
    }
  }

  private async publishJobResult(
    jobRun: typeof jobRuns.$inferSelect,
    status: 'success' | 'failed',
    errorMessage: string | undefined,
    startedAt: Date,
  ) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    // Update the job run
    await this.db
      .update(jobRuns)
      .set({ status, finishedAt, durationMs, errorMessage })
      .where(eq(jobRuns.id, jobRun.id));

    // Publish result event for bridge/alerts
    const result: JobResultEvent = {
      jobId: jobRun.jobId,
      runId: jobRun.id,
      status,
      durationMs,
      errorMessage,
      timestamp: finishedAt.toISOString(),
    };

    await this.redpanda.publish(TOPICS.JOB_RESULTS.name, jobRun.jobId, result);
  }

  private parseDuration(isoDuration: string): Date {
    // Simple ISO 8601 duration parser for common cases
    const now = Date.now();
    const match = isoDuration.match(
      /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
    );

    if (!match) {
      throw new Error(`Invalid ISO 8601 duration: ${isoDuration}`);
    }

    const days = parseInt(match[1] ?? '0', 10);
    const hours = parseInt(match[2] ?? '0', 10);
    const minutes = parseInt(match[3] ?? '0', 10);
    const seconds = parseInt(match[4] ?? '0', 10);

    const ms =
      days * 86400000 +
      hours * 3600000 +
      minutes * 60000 +
      seconds * 1000;

    return new Date(now + ms);
  }

  private interpolateString(template: string, context: Record<string, unknown>): string {
    return template.replace(/\{\{context\.(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
      const parts = path.split('.');
      let value: unknown = context;
      for (const part of parts) {
        if (value && typeof value === 'object') {
          value = (value as Record<string, unknown>)[part];
        } else {
          return '';
        }
      }
      return typeof value === 'string' ? value : JSON.stringify(value);
    });
  }

  private interpolatePayload(
    payload: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string') {
        result[key] = this.interpolateString(value, context);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}

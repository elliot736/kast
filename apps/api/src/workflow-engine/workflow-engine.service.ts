import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eq, and, desc, inArray } from 'drizzle-orm';
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
  WorkflowGraph,
  WorkflowNodeDefinition,
  WorkflowEdgeDefinition,
  RunStepConfig,
  SleepStepConfig,
  RunJobConfig,
  ConditionNodeConfig,
  FanOutNodeConfig,
  WebhookWaitConfig,
} from '../workflow/workflow.types';
import { evaluateExpression } from './expression-evaluator';
import { validateOutboundUrl } from '../common/util/url-validator';
import {
  buildAdjacency,
  computeFrontier,
  getLoopBodyNodes,
  isGraphFormat,
  migrateLinearToGraph,
  type AdjacencyMap,
} from './graph-utils';

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
        let event: WorkflowResumeEvent;
        try {
          event = JSON.parse(message.value!.toString());
        } catch {
          this.logger.warn('Skipping malformed Kafka message');
          return;
        }
        await this.replay(event);
      },
    );

    this.logger.log('Workflow engine consumer started');
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async emitLog(
    jobId: string,
    runId: string,
    level: JobRunLogEvent['level'],
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    const logEvent: JobRunLogEvent = {
      runId, jobId, level, message, metadata,
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
      workflowRunId, jobId, stepId, stepIndex, status, durationMs,
      timestamp: new Date().toISOString(),
    };
    await this.redpanda.publish(TOPICS.WORKFLOW_STEP_RESULTS.name, workflowRunId, event);
  }

  // ── Entry point ─────────────────────────────────────────────

  private async replay(event: WorkflowResumeEvent) {
    const [wfRun] = await this.db
      .select().from(workflowRuns)
      .where(eq(workflowRuns.id, event.workflowRunId))
      .limit(1);

    if (!wfRun || ['completed', 'cancelled', 'failed'].includes(wfRun.status)) return;

    const [workflow] = await this.db
      .select().from(workflows)
      .where(eq(workflows.id, wfRun.workflowId))
      .limit(1);

    if (!workflow) {
      this.logger.error(`Workflow ${wfRun.workflowId} not found for run ${wfRun.id}`);
      return;
    }

    const [jobRun] = await this.db
      .select().from(jobRuns)
      .where(eq(jobRuns.id, wfRun.jobRunId))
      .limit(1);

    if (!jobRun) return;

    // Detect format: graph or legacy array
    const graph: WorkflowGraph = isGraphFormat(workflow.steps)
      ? workflow.steps
      : migrateLinearToGraph(workflow.steps as any[]);

    await this.replayGraph(event, wfRun, graph, jobRun);
  }

  // ── Graph-based replay ──────────────────────────────────────

  private async replayGraph(
    event: WorkflowResumeEvent,
    wfRun: typeof workflowRuns.$inferSelect,
    graph: WorkflowGraph,
    jobRun: typeof jobRuns.$inferSelect,
  ) {
    const adjacency = buildAdjacency(graph);

    // Load memoized results
    const existingResults = await this.db
      .select().from(workflowStepResults)
      .where(eq(workflowStepResults.workflowRunId, wfRun.id));

    const resultMap = new Map(existingResults.map((r) => [r.stepId, r]));
    const completedNodeIds = new Set(
      existingResults.filter((r) => r.status === 'completed' || r.status === 'skipped').map((r) => r.stepId),
    );

    // Build context from completed node outputs
    let context: Record<string, unknown> = (wfRun.context as Record<string, unknown>) ?? {};
    for (const result of existingResults) {
      if (result.status === 'completed' && result.output) {
        context[result.stepId] = result.output;
      }
    }

    // Inject signal/child payloads on resume
    if ((event.reason === 'signal_received' || event.reason === 'child_completed') && event.signalPayload) {
      context.__lastSignal = event.signalPayload;
    }

    // Build condition results map from completed condition nodes
    const conditionResults = new Map<string, boolean>();
    for (const node of graph.nodes) {
      if (node.type === 'condition' && resultMap.has(node.id)) {
        const output = resultMap.get(node.id)!.output as { result?: boolean } | null;
        if (output?.result !== undefined) {
          conditionResults.set(node.id, output.result);
        }
      }
    }

    // Compute frontier
    const frontier = computeFrontier(graph, adjacency, completedNodeIds, conditionResults);

    if (frontier.length === 0) {
      // No more nodes to execute — workflow is complete
      if (existingResults.length > 0) {
        await this.completeWorkflow(wfRun, jobRun, context);
      }
      return;
    }

    // Execute frontier nodes one at a time (sequential for now — parallel comes later)
    for (const nodeId of frontier) {
      const entry = adjacency.get(nodeId);
      if (!entry) continue;

      await this.executeGraphNode(
        entry.node, graph, adjacency, wfRun, jobRun, context, resultMap, conditionResults,
      );

      // After executing one node, publish resume to continue the frontier
      // This lets sleep/wait nodes pause correctly
      break; // Execute one node per resume cycle
    }
  }

  // ── Execute a single graph node ─────────────────────────────

  private async executeGraphNode(
    node: WorkflowNodeDefinition,
    graph: WorkflowGraph,
    adjacency: AdjacencyMap,
    wfRun: typeof workflowRuns.$inferSelect,
    jobRun: typeof jobRuns.$inferSelect,
    context: Record<string, unknown>,
    resultMap: Map<string, typeof workflowStepResults.$inferSelect>,
    conditionResults: Map<string, boolean>,
  ) {
    const startedAt = new Date();

    await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info',
      `Executing node: ${node.name} (${node.type})`,
      { nodeId: node.id },
    );

    try {
      switch (node.type) {
        case 'run': {
          const config = node.config as RunStepConfig;
          const result = await this.executeRunStep(config, context);
          const finishedAt = new Date();
          const durationMs = finishedAt.getTime() - startedAt.getTime();

          await this.recordNodeResult(wfRun.id, node.id, 'completed', result, durationMs, startedAt);
          context[node.id] = result;

          await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', `Node ${node.name} completed`);
          await this.emitStepResult(wfRun.id, jobRun.jobId, node.id, 0, 'completed', durationMs);

          // Check outgoing edges for loops
          await this.handleOutgoingEdges(node.id, graph, adjacency, wfRun, jobRun, context);
          break;
        }

        case 'sleep': {
          const config = node.config as SleepStepConfig;
          const resumeAt = this.parseDuration(config.duration);

          await this.recordNodeResult(wfRun.id, node.id, 'completed', { resumeAt: resumeAt.toISOString() }, 0, startedAt);

          await this.db.update(workflowRuns).set({
            status: 'sleeping',
            currentStepId: node.id,
            context,
            resumeAt,
          }).where(eq(workflowRuns.id, wfRun.id));

          await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', `Sleeping until ${resumeAt.toISOString()}`);
          return; // Sleeper will resume
        }

        case 'condition': {
          const config = node.config as ConditionNodeConfig;
          const result = evaluateExpression(config.expression, context);
          const output = { expression: config.expression, result };
          const finishedAt = new Date();

          await this.recordNodeResult(wfRun.id, node.id, 'completed', output, finishedAt.getTime() - startedAt.getTime(), startedAt);
          context[node.id] = output;
          conditionResults.set(node.id, result);

          await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info',
            `Condition "${node.name}": ${config.expression} → ${result}`,
          );
          await this.emitStepResult(wfRun.id, jobRun.jobId, node.id, 0, 'completed');
          await this.continueGraph(wfRun, context);
          break;
        }

        case 'run_job': {
          const config = node.config as RunJobConfig;

          // Find latest workflow for target job
          const [targetWorkflow] = await this.db.select().from(workflows)
            .where(eq(workflows.jobId, config.targetJobId))
            .orderBy(desc(workflows.version))
            .limit(1);

          if (!targetWorkflow) {
            throw new Error(`No workflow found for job ${config.targetJobId}`);
          }

          // Create child job run + workflow run
          const [childJobRun] = await this.db.insert(jobRuns)
            .values({ jobId: config.targetJobId, trigger: 'retry', scheduledAt: new Date() })
            .returning();

          const [childWfRun] = await this.db.insert(workflowRuns)
            .values({
              workflowId: targetWorkflow.id,
              jobRunId: childJobRun.id,
              status: 'running',
              currentStepIndex: 0,
              context: config.input ?? {},
            })
            .returning();

          // Start child
          await this.redpanda.publish(TOPICS.WORKFLOW_RESUME.name, childWfRun.id, {
            workflowRunId: childWfRun.id,
            reason: 'initial',
            timestamp: new Date().toISOString(),
          });

          const output = { childRunId: childWfRun.id, childJobRunId: childJobRun.id };
          await this.recordNodeResult(wfRun.id, node.id, 'completed', output, new Date().getTime() - startedAt.getTime(), startedAt);
          context[node.id] = output;

          if (config.mode === 'wait') {
            await this.db.update(workflowRuns).set({
              status: 'waiting',
              currentStepId: node.id,
              context,
              waitingForChildRunId: childWfRun.id,
            }).where(eq(workflowRuns.id, wfRun.id));

            await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', 'Spawned child workflow, waiting for completion');
            return; // Sleeper will resume when child completes
          }

          await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', 'Spawned child workflow (fire-and-forget)');
          await this.emitStepResult(wfRun.id, jobRun.jobId, node.id, 0, 'completed');
          await this.continueGraph(wfRun, context);
          break;
        }

        case 'fan_out': {
          await this.recordNodeResult(wfRun.id, node.id, 'completed', {}, 0, startedAt);
          context[node.id] = {};
          await this.emitStepResult(wfRun.id, jobRun.jobId, node.id, 0, 'completed');
          await this.continueGraph(wfRun, context);
          break;
        }

        case 'webhook_wait': {
          const config = node.config as WebhookWaitConfig;

          // Check signal buffer first — maybe a signal arrived before we got here
          const [pendingSignal] = await this.db
            .select().from(workflowSignals)
            .where(
              and(
                eq(workflowSignals.targetRunId, wfRun.id),
                eq(workflowSignals.delivered, false),
              ),
            )
            .orderBy(workflowSignals.createdAt)
            .limit(1);

          if (pendingSignal) {
            // Signal already buffered — deliver and continue
            await this.db.update(workflowSignals)
              .set({ delivered: true, deliveredAt: new Date() })
              .where(eq(workflowSignals.id, pendingSignal.id));

            const output = { signal: pendingSignal.payload, sourceRunId: pendingSignal.sourceRunId };
            await this.recordNodeResult(wfRun.id, node.id, 'completed', output, 0, startedAt);
            context[node.id] = output;

            await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', 'Webhook signal found in buffer, continuing');
            await this.emitStepResult(wfRun.id, jobRun.jobId, node.id, 0, 'completed');
            await this.continueGraph(wfRun, context);
            break;
          }

          // No signal — pause and wait
          const waitTimeoutAt = config.timeoutDuration
            ? this.parseDuration(config.timeoutDuration)
            : null;

          await this.db.update(workflowRuns).set({
            status: 'waiting',
            currentStepId: node.id,
            context,
            waitTimeoutAt,
          }).where(eq(workflowRuns.id, wfRun.id));

          await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info',
            `Waiting for webhook${waitTimeoutAt ? ` (timeout: ${waitTimeoutAt.toISOString()})` : ''}`,
          );
          return; // Signal delivery consumer will resume
        }
      }
    } catch (err: any) {
      const finishedAt = new Date();
      const errorMessage = err.message ?? String(err);

      await this.recordNodeResult(wfRun.id, node.id, 'failed', undefined, finishedAt.getTime() - startedAt.getTime(), startedAt, errorMessage);

      await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'error', `Node ${node.name} failed: ${errorMessage}`);
      await this.emitStepResult(wfRun.id, jobRun.jobId, node.id, 0, 'failed', finishedAt.getTime() - startedAt.getTime());

      const onFailure = node.onFailure ?? 'abort';
      if (onFailure === 'abort') {
        await this.db.update(workflowRuns)
          .set({ status: 'failed', finishedAt, context })
          .where(eq(workflowRuns.id, wfRun.id));
        await this.publishJobResult(jobRun, 'failed', errorMessage, startedAt);
      } else if (onFailure === 'continue') {
        // Mark as completed (with failure noted) and continue
        await this.continueGraph(wfRun, context);
      }
    }
  }

  // ── Graph continuation ──────────────────────────────────────

  private async handleOutgoingEdges(
    nodeId: string,
    graph: WorkflowGraph,
    adjacency: AdjacencyMap,
    wfRun: typeof workflowRuns.$inferSelect,
    jobRun: typeof jobRuns.$inferSelect,
    context: Record<string, unknown>,
  ) {
    const entry = adjacency.get(nodeId);
    if (!entry) return;

    // Check for loop back-edges
    for (const edge of entry.outgoing) {
      if (!edge.loop) continue;

      const loopCounters = (wfRun.loopCounters as Record<string, number>) ?? {};
      const iteration = (loopCounters[edge.id] ?? 0) + 1;

      if (iteration > (edge.loop.maxIterations ?? 100)) {
        throw new Error(`Loop exceeded max iterations (${edge.loop.maxIterations})`);
      }

      const conditionMet = evaluateExpression(edge.loop.untilExpression, context);

      if (conditionMet) {
        // Loop done — clear counter, continue forward
        delete loopCounters[edge.id];
        await this.db.update(workflowRuns)
          .set({ loopCounters })
          .where(eq(workflowRuns.id, wfRun.id));

        await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info',
          `Loop completed after ${iteration - 1} iteration(s)`,
        );
        await this.continueGraph(wfRun, context);
        return;
      }

      // Loop back — clear results for loop body and resume from target
      loopCounters[edge.id] = iteration;
      const loopBody = getLoopBodyNodes(graph, edge);
      const bodyIds = [...loopBody];

      if (bodyIds.length > 0) {
        await this.db.delete(workflowStepResults)
          .where(
            and(
              eq(workflowStepResults.workflowRunId, wfRun.id),
              inArray(workflowStepResults.stepId, bodyIds),
            ),
          );

        for (const id of bodyIds) {
          delete context[id];
        }
      }

      await this.db.update(workflowRuns)
        .set({ currentStepId: edge.target, context, loopCounters })
        .where(eq(workflowRuns.id, wfRun.id));

      await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info',
        `Loop iteration ${iteration}: jumping back to "${edge.target}"`,
      );

      await this.redpanda.publish(TOPICS.WORKFLOW_RESUME.name, wfRun.id, {
        workflowRunId: wfRun.id,
        reason: 'loop_iteration',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // No loops — normal continuation
    await this.continueGraph(wfRun, context);
  }

  private async continueGraph(
    wfRun: typeof workflowRuns.$inferSelect,
    context: Record<string, unknown>,
  ) {
    await this.db.update(workflowRuns)
      .set({ context })
      .where(eq(workflowRuns.id, wfRun.id));

    await this.redpanda.publish(TOPICS.WORKFLOW_RESUME.name, wfRun.id, {
      workflowRunId: wfRun.id,
      reason: 'initial', // re-enter replay to compute next frontier
      timestamp: new Date().toISOString(),
    });
  }

  private async completeWorkflow(
    wfRun: typeof workflowRuns.$inferSelect,
    jobRun: typeof jobRuns.$inferSelect,
    context: Record<string, unknown>,
  ) {
    const finishedAt = new Date();
    await this.db.update(workflowRuns)
      .set({ status: 'completed', finishedAt, context })
      .where(eq(workflowRuns.id, wfRun.id));

    await this.publishJobResult(jobRun, 'success', undefined, wfRun.startedAt ?? finishedAt);
    await this.emitLog(jobRun.jobId, wfRun.jobRunId, 'info', 'Workflow completed successfully');
  }

  // ── Record result ───────────────────────────────────────────

  private async recordNodeResult(
    workflowRunId: string,
    stepId: string,
    status: 'completed' | 'failed' | 'skipped',
    output: unknown,
    durationMs: number,
    startedAt: Date,
    errorMessage?: string,
  ) {
    await this.db.insert(workflowStepResults).values({
      workflowRunId,
      stepId,
      stepIndex: 0, // legacy field, not meaningful in graph mode
      status,
      output,
      errorMessage,
      durationMs,
      startedAt,
      finishedAt: new Date(),
    });
  }

  // ── Shared utilities ────────────────────────────────────────

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

    await validateOutboundUrl(config.url);

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

    await this.db.update(jobRuns)
      .set({ status, finishedAt, durationMs, errorMessage })
      .where(eq(jobRuns.id, jobRun.id));

    const result: JobResultEvent = {
      jobId: jobRun.jobId,
      runId: jobRun.id,
      status, durationMs, errorMessage,
      timestamp: finishedAt.toISOString(),
    };

    await this.redpanda.publish(TOPICS.JOB_RESULTS.name, jobRun.jobId, result);
  }

  private parseDuration(isoDuration: string): Date {
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
}

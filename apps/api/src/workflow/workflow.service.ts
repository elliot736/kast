import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.provider';
import { workflows, workflowRuns, workflowStepResults } from '../database/schema';
import { isGraphFormat, migrateLinearToGraph } from '../workflow-engine/graph-utils';

@Injectable()
export class WorkflowService {
  constructor(@Inject(DRIZZLE) private db: Database) {}

  async getByJobId(jobId: string) {
    const [workflow] = await this.db
      .select()
      .from(workflows)
      .where(eq(workflows.jobId, jobId))
      .orderBy(desc(workflows.version))
      .limit(1);
    return workflow ?? null;
  }

  async upsert(jobId: string, dto: { steps: any }) {
    const existing = await this.getByJobId(jobId);
    const nextVersion = existing ? existing.version + 1 : 1;

    // Accept both graph { nodes, edges } and legacy array format
    let stepsData = dto.steps;
    if (Array.isArray(stepsData)) {
      // Legacy format — auto-migrate to graph
      stepsData = migrateLinearToGraph(stepsData);
    }

    const [workflow] = await this.db
      .insert(workflows)
      .values({
        jobId,
        version: nextVersion,
        steps: stepsData,
      })
      .returning();

    return workflow;
  }

  async getWorkflowRun(jobId: string, runId: string) {
    const workflow = await this.getByJobId(jobId);
    if (!workflow) throw new NotFoundException('Workflow not found for this job');

    const [wfRun] = await this.db
      .select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.jobRunId, runId),
          eq(workflowRuns.workflowId, workflow.id),
        ),
      )
      .limit(1);

    if (!wfRun) throw new NotFoundException('Workflow run not found');

    const stepResults = await this.db
      .select()
      .from(workflowStepResults)
      .where(eq(workflowStepResults.workflowRunId, wfRun.id))
      .orderBy(workflowStepResults.finishedAt);

    // Ensure graph format in response
    const steps = isGraphFormat(workflow.steps)
      ? workflow.steps
      : migrateLinearToGraph(workflow.steps as any[]);

    return {
      ...wfRun,
      steps,
      stepResults,
    };
  }

  async cancelWorkflowRun(jobId: string, runId: string) {
    const workflow = await this.getByJobId(jobId);
    if (!workflow) throw new NotFoundException('Workflow not found for this job');

    const [wfRun] = await this.db
      .update(workflowRuns)
      .set({
        status: 'cancelled',
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(workflowRuns.jobRunId, runId),
          eq(workflowRuns.workflowId, workflow.id),
        ),
      )
      .returning();

    if (!wfRun) throw new NotFoundException('Workflow run not found');
    return wfRun;
  }
}

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.provider';
import { workflows, workflowRuns, workflowStepResults } from '../database/schema';
import type { CreateWorkflowDto } from './workflow.dto';

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

  async upsert(jobId: string, dto: CreateWorkflowDto) {
    const existing = await this.getByJobId(jobId);
    const nextVersion = existing ? existing.version + 1 : 1;

    const [workflow] = await this.db
      .insert(workflows)
      .values({
        jobId,
        version: nextVersion,
        steps: dto.steps,
      })
      .returning();

    return workflow;
  }

  async getWorkflowRun(jobId: string, runId: string) {
    // First find the workflow for this job
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
      .orderBy(workflowStepResults.stepIndex);

    return {
      ...wfRun,
      steps: workflow.steps,
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

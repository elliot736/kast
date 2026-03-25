import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { eq, and, lte, isNotNull } from 'drizzle-orm';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import { workflowRuns } from '../database/schema';
import type { WorkflowResumeEvent } from '../redpanda/redpanda.interfaces';

@Injectable()
export class WorkflowSleeperService {
  private readonly logger = new Logger(WorkflowSleeperService.name);

  constructor(
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
  ) {}

  @Interval(10000)
  async sweep() {
    const now = new Date();

    const sleepingRuns = await this.db
      .select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.status, 'sleeping'),
          lte(workflowRuns.resumeAt, now),
        ),
      );

    for (const run of sleepingRuns) {
      try {
        // Reset sleep state
        await this.db
          .update(workflowRuns)
          .set({
            status: 'running',
            resumeAt: null,
          })
          .where(eq(workflowRuns.id, run.id));

        const event: WorkflowResumeEvent = {
          workflowRunId: run.id,
          reason: 'sleep_expired',
          timestamp: now.toISOString(),
        };

        await this.redpanda.publish(TOPICS.WORKFLOW_RESUME.name, run.id, event);

        this.logger.log(`Resumed sleeping workflow run ${run.id}`);
      } catch (err) {
        this.logger.error(`Failed to resume workflow run ${run.id}: ${err}`);
      }
    }
  }

  @Interval(5000)
  async sweepChildCompletion() {
    // Find workflow runs waiting for a child to complete
    const waitingForChild = await this.db
      .select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.status, 'waiting'),
          isNotNull(workflowRuns.waitingForChildRunId),
        ),
      );

    for (const parentRun of waitingForChild) {
      try {
        // Check if child has completed
        const [childRun] = await this.db
          .select()
          .from(workflowRuns)
          .where(eq(workflowRuns.id, parentRun.waitingForChildRunId!))
          .limit(1);

        if (!childRun) continue;
        if (childRun.status !== 'completed' && childRun.status !== 'failed') continue;

        // Child is done — resume parent
        await this.db
          .update(workflowRuns)
          .set({
            status: 'running',
            waitingForChildRunId: null,
          })
          .where(eq(workflowRuns.id, parentRun.id));

        const resumeEvent: WorkflowResumeEvent = {
          workflowRunId: parentRun.id,
          reason: 'child_completed',
          signalPayload: { childStatus: childRun.status, childContext: childRun.context },
          timestamp: new Date().toISOString(),
        };
        await this.redpanda.publish(TOPICS.WORKFLOW_RESUME.name, parentRun.id, resumeEvent);

        this.logger.log(`Child ${childRun.id} completed, resuming parent ${parentRun.id}`);
      } catch (err) {
        this.logger.error(`Failed to check child completion for ${parentRun.id}: ${err}`);
      }
    }
  }
}

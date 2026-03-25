import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { eq, and } from 'drizzle-orm';
import { WorkflowService } from './workflow.service';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import { workflowRuns, workflowSignals } from '../database/schema';
import { createWorkflowSchema, sendSignalSchema } from './workflow.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { WorkflowSignalEvent } from '../redpanda/redpanda.interfaces';

@ApiTags('workflows')
@Controller('api/v1')
export class WorkflowController {
  constructor(
    private workflowService: WorkflowService,
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
  ) {}

  @Get('jobs/:id/workflow')
  @ApiOperation({ summary: 'Get workflow definition for a job' })
  @ApiResponse({ status: 200, description: 'Workflow definition' })
  async getWorkflow(@Param('id') jobId: string) {
    return this.workflowService.getByJobId(jobId);
  }

  @Put('jobs/:id/workflow')
  @ApiOperation({ summary: 'Create or update workflow definition' })
  @ApiResponse({ status: 200, description: 'Workflow created/updated' })
  async upsertWorkflow(
    @Param('id') jobId: string,
    @Body(new ZodValidationPipe(createWorkflowSchema)) body: any,
  ) {
    return this.workflowService.upsert(jobId, body);
  }

  @Get('jobs/:id/runs/:runId/workflow')
  @ApiOperation({ summary: 'Get workflow run detail with step results' })
  @ApiResponse({ status: 200, description: 'Workflow run detail' })
  async getWorkflowRun(
    @Param('id') jobId: string,
    @Param('runId') runId: string,
  ) {
    return this.workflowService.getWorkflowRun(jobId, runId);
  }

  @Post('jobs/:id/runs/:runId/workflow/cancel')
  @ApiOperation({ summary: 'Cancel a workflow run' })
  @ApiResponse({ status: 200, description: 'Workflow run cancelled' })
  async cancelWorkflowRun(
    @Param('id') jobId: string,
    @Param('runId') runId: string,
  ) {
    return this.workflowService.cancelWorkflowRun(jobId, runId);
  }

  @Post('workflow-runs/:runId/signal')
  @ApiOperation({ summary: 'Send a signal to a specific workflow run' })
  @ApiResponse({ status: 202, description: 'Signal delivered' })
  async sendSignal(
    @Param('runId') runId: string,
    @Body(new ZodValidationPipe(sendSignalSchema)) body: any,
  ) {
    // Write to signal buffer
    await this.db.insert(workflowSignals).values({
      targetRunId: runId,
      sourceRunId: null,
      sourceStepId: 'external',
      payload: body.payload ?? {},
    });

    // Publish for real-time delivery
    const signal: WorkflowSignalEvent = {
      targetRunId: runId,
      sourceStepId: 'external',
      payload: body.payload ?? {},
      timestamp: new Date().toISOString(),
    };
    await this.redpanda.publish(TOPICS.WORKFLOW_SIGNALS.name, runId, signal);

    return { ok: true };
  }

  @Get('workflow-runs/:runId/signals')
  @ApiOperation({ summary: 'Get signal history for a workflow run' })
  @ApiResponse({ status: 200, description: 'Signal history' })
  async getSignals(@Param('runId') runId: string) {
    return this.db
      .select()
      .from(workflowSignals)
      .where(eq(workflowSignals.targetRunId, runId))
      .orderBy(workflowSignals.createdAt);
  }
}

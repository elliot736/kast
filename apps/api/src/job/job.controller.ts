import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JobService } from './job.service';
import { createJobSchema, updateJobSchema } from './job.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('jobs')
@Controller('api/v1/jobs')
export class JobController {
  constructor(private jobService: JobService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new job' })
  @ApiResponse({ status: 201, description: 'Job created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @UsePipes(new ZodValidationPipe(createJobSchema))
  async create(@Body() body: any) {
    return this.jobService.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'List all jobs' })
  @ApiResponse({ status: 200, description: 'List of jobs' })
  async findAll(
    @Query('status') status?: string,
    @Query('tag') tag?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.jobService.findAll({ status, tag, teamId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a job by ID' })
  @ApiResponse({ status: 200, description: 'Job details' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async findOne(@Param('id') id: string) {
    return this.jobService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a job' })
  @ApiResponse({ status: 200, description: 'Job updated' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(updateJobSchema)) body: any) {
    return this.jobService.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a job' })
  @ApiResponse({ status: 200, description: 'Job deleted' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async delete(@Param('id') id: string) {
    await this.jobService.delete(id);
    return { deleted: true };
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause a job' })
  @ApiResponse({ status: 200, description: 'Job paused' })
  async pause(@Param('id') id: string) {
    return this.jobService.pause(id);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume a paused job' })
  @ApiResponse({ status: 200, description: 'Job resumed' })
  async resume(@Param('id') id: string) {
    return this.jobService.resume(id);
  }

  @Post(':id/trigger')
  @ApiOperation({ summary: 'Manually trigger a job' })
  @ApiResponse({ status: 201, description: 'Job run created' })
  async trigger(@Param('id') id: string) {
    return this.jobService.trigger(id);
  }

  @Get(':id/runs')
  @ApiOperation({ summary: 'List runs for a job' })
  @ApiResponse({ status: 200, description: 'List of runs' })
  async getRuns(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.jobService.getRuns(id, {
      status,
      limit: Math.min(Math.max(parseInt(limit ?? '50', 10) || 50, 1), 100),
      offset: Math.max(parseInt(offset ?? '0', 10) || 0, 0),
    });
  }

  @Get(':id/runs/:runId')
  @ApiOperation({ summary: 'Get a specific run' })
  @ApiResponse({ status: 200, description: 'Run details' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async getRun(@Param('id') id: string, @Param('runId') runId: string) {
    return this.jobService.getRunById(id, runId);
  }

  @Get(':id/runs/:runId/logs')
  @ApiOperation({ summary: 'Get logs for a run' })
  @ApiResponse({ status: 200, description: 'List of log entries' })
  async getRunLogs(
    @Param('runId') runId: string,
    @Query('level') level?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.jobService.getRunLogs(runId, {
      level,
      limit: Math.min(Math.max(parseInt(limit ?? '100', 10) || 100, 1), 500),
      offset: Math.max(parseInt(offset ?? '0', 10) || 0, 0),
    });
  }

  @Post(':id/runs/:runId/cancel')
  @ApiOperation({ summary: 'Cancel a run' })
  @ApiResponse({ status: 200, description: 'Run cancelled' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async cancelRun(@Param('id') id: string, @Param('runId') runId: string) {
    return this.jobService.cancelRun(id, runId);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get job statistics' })
  @ApiResponse({ status: 200, description: 'Job statistics' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getStats(@Param('id') id: string) {
    return this.jobService.getStats(id);
  }
}

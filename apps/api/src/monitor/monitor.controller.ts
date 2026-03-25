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
import { MonitorService } from './monitor.service';
import { createMonitorSchema, updateMonitorSchema } from './monitor.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('monitors')
@Controller('api/v1/monitors')
export class MonitorController {
  constructor(private monitorService: MonitorService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new monitor' })
  @ApiResponse({ status: 201, description: 'Monitor created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @UsePipes(new ZodValidationPipe(createMonitorSchema))
  async create(@Body() body: any) {
    return this.monitorService.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'List all monitors' })
  @ApiResponse({ status: 200, description: 'List of monitors' })
  async findAll(
    @Query('status') status?: string,
    @Query('tag') tag?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.monitorService.findAll({ status, tag, teamId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a monitor by ID' })
  @ApiResponse({ status: 200, description: 'Monitor details' })
  @ApiResponse({ status: 404, description: 'Monitor not found' })
  async findOne(@Param('id') id: string) {
    return this.monitorService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a monitor' })
  @ApiResponse({ status: 200, description: 'Monitor updated' })
  @ApiResponse({ status: 404, description: 'Monitor not found' })
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(updateMonitorSchema)) body: any) {
    return this.monitorService.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a monitor' })
  @ApiResponse({ status: 200, description: 'Monitor deleted' })
  @ApiResponse({ status: 404, description: 'Monitor not found' })
  async delete(@Param('id') id: string) {
    await this.monitorService.delete(id);
    return { deleted: true };
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause a monitor' })
  @ApiResponse({ status: 200, description: 'Monitor paused' })
  @ApiResponse({ status: 404, description: 'Monitor not found' })
  async pause(@Param('id') id: string) {
    return this.monitorService.pause(id, true);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume a paused monitor' })
  @ApiResponse({ status: 200, description: 'Monitor resumed' })
  @ApiResponse({ status: 404, description: 'Monitor not found' })
  async resume(@Param('id') id: string) {
    return this.monitorService.pause(id, false);
  }

  @Get(':id/pings')
  @ApiOperation({ summary: 'Get pings for a monitor' })
  @ApiResponse({ status: 200, description: 'List of pings' })
  @ApiResponse({ status: 404, description: 'Monitor not found' })
  async getPings(@Param('id') id: string) {
    return this.monitorService.getPings(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get stats for a monitor' })
  @ApiResponse({ status: 200, description: 'Monitor statistics' })
  @ApiResponse({ status: 404, description: 'Monitor not found' })
  async getStats(@Param('id') id: string) {
    return this.monitorService.getStats(id);
  }
}

import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IncidentService } from './incident.service';

@ApiTags('incidents')
@Controller('api/v1/incidents')
export class IncidentController {
  constructor(private incidentService: IncidentService) {}

  @Get()
  @ApiOperation({ summary: 'List all incidents' })
  @ApiResponse({ status: 200, description: 'List of incidents' })
  async findAll(@Query('status') status?: 'open' | 'acknowledged' | 'resolved') {
    return this.incidentService.findAll(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an incident by ID' })
  @ApiResponse({ status: 200, description: 'Incident details' })
  @ApiResponse({ status: 404, description: 'Incident not found' })
  async findOne(@Param('id') id: string) {
    return this.incidentService.findById(id);
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge an incident' })
  @ApiResponse({ status: 200, description: 'Incident acknowledged' })
  @ApiResponse({ status: 404, description: 'Incident not found' })
  async acknowledge(
    @Param('id') id: string,
    @Body('acknowledgedBy') acknowledgedBy?: string,
  ) {
    return this.incidentService.acknowledge(id, acknowledgedBy);
  }
}

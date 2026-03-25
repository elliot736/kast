import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorator';
import { StatusService } from './status.service';

@ApiTags('status')
@Public()
@Controller('status')
export class StatusController {
  constructor(private statusService: StatusService) {}

  @Get(':teamSlug')
  @ApiOperation({ summary: 'Get public status page for a team' })
  @ApiResponse({ status: 200, description: 'Status page data' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async getStatusPage(@Param('teamSlug') teamSlug: string) {
    return this.statusService.getStatusPage(teamSlug);
  }
}

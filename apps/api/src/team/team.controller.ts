import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TeamService } from './team.service';
import { createTeamSchema, updateTeamSchema } from './team.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('teams')
@Controller('api/v1/teams')
export class TeamController {
  constructor(private teamService: TeamService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new team' })
  @ApiResponse({ status: 201, description: 'Team created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @UsePipes(new ZodValidationPipe(createTeamSchema))
  async create(@Body() body: any) {
    return this.teamService.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'List all teams' })
  @ApiResponse({ status: 200, description: 'List of teams' })
  async findAll() {
    return this.teamService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a team by ID' })
  @ApiResponse({ status: 200, description: 'Team details' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async findOne(@Param('id') id: string) {
    return this.teamService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a team' })
  @ApiResponse({ status: 200, description: 'Team updated' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  @UsePipes(new ZodValidationPipe(updateTeamSchema))
  async update(@Param('id') id: string, @Body() body: any) {
    return this.teamService.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a team' })
  @ApiResponse({ status: 200, description: 'Team deleted' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async delete(@Param('id') id: string) {
    await this.teamService.delete(id);
    return { deleted: true };
  }
}

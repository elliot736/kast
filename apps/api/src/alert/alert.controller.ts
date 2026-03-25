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
import { AlertService } from './alert.service';
import { createAlertConfigSchema, updateAlertConfigSchema } from './alert.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('alerts')
@Controller('api/v1')
export class AlertController {
  constructor(private alertService: AlertService) {}

  @Post('alert-configs')
  @ApiOperation({ summary: 'Create an alert configuration' })
  @ApiResponse({ status: 201, description: 'Alert config created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @UsePipes(new ZodValidationPipe(createAlertConfigSchema))
  async createConfig(@Body() body: any) {
    return this.alertService.createConfig(body);
  }

  @Get('alert-configs')
  @ApiOperation({ summary: 'List alert configurations' })
  @ApiResponse({ status: 200, description: 'List of alert configs' })
  async listConfigs(@Query('monitorId') monitorId?: string) {
    return this.alertService.listConfigs(monitorId);
  }

  @Patch('alert-configs/:id')
  @ApiOperation({ summary: 'Update an alert configuration' })
  @ApiResponse({ status: 200, description: 'Alert config updated' })
  @ApiResponse({ status: 404, description: 'Alert config not found' })
  @UsePipes(new ZodValidationPipe(updateAlertConfigSchema))
  async updateConfig(@Param('id') id: string, @Body() body: any) {
    return this.alertService.updateConfig(id, body);
  }

  @Delete('alert-configs/:id')
  @ApiOperation({ summary: 'Delete an alert configuration' })
  @ApiResponse({ status: 200, description: 'Alert config deleted' })
  @ApiResponse({ status: 404, description: 'Alert config not found' })
  async deleteConfig(@Param('id') id: string) {
    await this.alertService.deleteConfig(id);
    return { deleted: true };
  }

  @Get('dead-letters')
  @ApiOperation({ summary: 'List dead letter alerts' })
  @ApiResponse({ status: 200, description: 'List of dead letters' })
  async listDeadLetters() {
    return this.alertService.listDeadLetters();
  }

  @Post('dead-letters/:id/retry')
  @ApiOperation({ summary: 'Retry a dead letter alert' })
  @ApiResponse({ status: 200, description: 'Dead letter retried' })
  @ApiResponse({ status: 404, description: 'Dead letter not found' })
  async retryDeadLetter(@Param('id') id: string) {
    return this.alertService.retryDeadLetter(id);
  }
}

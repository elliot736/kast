import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { Public } from './auth/auth.decorator';
import { MonitorService } from './monitor/monitor.service';
import { DRIZZLE, type Database } from './database/database.provider';
import { RedpandaService } from './redpanda/redpanda.service';

@ApiTags('health')
@Public()
@Controller()
export class HealthController {
  constructor(
    private monitorService: MonitorService,
    @Inject(DRIZZLE) private db: Database,
    private redpanda: RedpandaService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  async ready() {
    const checks: Record<string, string> = {};

    try {
      await this.db.execute(sql`SELECT 1`);
      checks.postgres = 'ok';
    } catch (err) {
      checks.postgres = `error: ${(err as Error).message}`;
    }

    try {
      await this.redpanda.healthCheck();
      checks.redpanda = 'ok';
    } catch (err) {
      checks.redpanda = `error: ${(err as Error).message}`;
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    if (!allOk) {
      throw new ServiceUnavailableException({
        status: 'not ready',
        checks,
        timestamp: new Date().toISOString(),
      });
    }

    return { status: 'ready', checks, timestamp: new Date().toISOString() };
  }

  @Get('api/v1/dashboard')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard stats' })
  async dashboard() {
    return this.monitorService.getDashboardStats();
  }
}

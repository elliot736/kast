import { Controller, Get, Post, Param, Body, Req, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/auth.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { PingService } from './ping.service';

const MAX_BODY_LENGTH = 65_536; // 64 KB

function truncateBody(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'object' && Object.keys(body as object).length === 0) return undefined;
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  if (!str || str === '{}') return undefined;
  return str.length > MAX_BODY_LENGTH ? str.slice(0, MAX_BODY_LENGTH) : str;
}

@ApiTags('ping')
@Public()
@UseGuards(RateLimitGuard)
@Controller('ping')
export class PingController {
  constructor(private pingService: PingService) {}

  @Get(':uuid')
  @HttpCode(202)
  @ApiOperation({ summary: 'Send a simple ping' })
  @ApiResponse({ status: 202, description: 'Ping accepted' })
  @ApiResponse({ status: 404, description: 'Monitor not found' })
  async simplePing(@Param('uuid') uuid: string, @Req() req: Request) {
    return this.pingService.handlePing(uuid, 'success', {
      userAgent: req.headers['user-agent'],
      sourceIp: req.ip,
    });
  }

  @Post(':uuid/start')
  @HttpCode(202)
  @ApiOperation({ summary: 'Signal job start' })
  @ApiResponse({ status: 202, description: 'Start signal accepted' })
  async start(@Param('uuid') uuid: string, @Body() body: any, @Req() req: Request) {
    return this.pingService.handlePing(uuid, 'start', {
      body: truncateBody(body),
      userAgent: req.headers['user-agent'],
      sourceIp: req.ip,
    });
  }

  @Post(':uuid/success')
  @HttpCode(202)
  @ApiOperation({ summary: 'Signal job success' })
  @ApiResponse({ status: 202, description: 'Success signal accepted' })
  async success(@Param('uuid') uuid: string, @Body() body: any, @Req() req: Request) {
    return this.pingService.handlePing(uuid, 'success', {
      body: truncateBody(body),
      userAgent: req.headers['user-agent'],
      sourceIp: req.ip,
    });
  }

  @Post(':uuid/fail')
  @HttpCode(202)
  @ApiOperation({ summary: 'Signal job failure' })
  @ApiResponse({ status: 202, description: 'Failure signal accepted' })
  async fail(@Param('uuid') uuid: string, @Body() body: any, @Req() req: Request) {
    return this.pingService.handlePing(uuid, 'fail', {
      body: truncateBody(body),
      userAgent: req.headers['user-agent'],
      sourceIp: req.ip,
    });
  }

  @Post(':uuid/log')
  @HttpCode(202)
  @ApiOperation({ summary: 'Send a log entry' })
  @ApiResponse({ status: 202, description: 'Log accepted' })
  async log(@Param('uuid') uuid: string, @Body() body: any, @Req() req: Request) {
    return this.pingService.handlePing(uuid, 'log', {
      body: truncateBody(body),
      userAgent: req.headers['user-agent'],
      sourceIp: req.ip,
    });
  }
}

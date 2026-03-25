import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  NotFoundException,
  Sse,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Observable, interval, map, takeWhile, finalize } from 'rxjs';
import { ReplayService } from './replay.service';

@ApiTags('replay')
@Controller('api/v1/replay')
export class ReplayController {
  constructor(private replayService: ReplayService) {}

  @Post()
  @ApiOperation({ summary: 'Create a replay session' })
  @ApiResponse({ status: 201, description: 'Replay session created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createSession(
    @Body()
    body: {
      fromTimestamp: number;
      toTimestamp: number;
      topic?: string;
      monitorId?: string;
    },
  ) {
    const session = await this.replayService.createSession(body);
    return { sessionId: session.id, status: session.status };
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Get replay session status' })
  @ApiResponse({ status: 200, description: 'Replay session details' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSession(@Param('sessionId') sessionId: string) {
    const session = this.replayService.getSession(sessionId);
    if (!session) throw new NotFoundException('Replay session not found');
    return {
      id: session.id,
      status: session.status,
      eventCount: session.events.length,
    };
  }

  @Sse(':sessionId/events')
  @ApiOperation({ summary: 'Stream replay events via SSE' })
  @ApiResponse({ status: 200, description: 'SSE event stream' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  streamEvents(
    @Param('sessionId') sessionId: string,
  ): Observable<MessageEvent> {
    let lastIndex = 0;

    return interval(500).pipe(
      map(() => {
        const session = this.replayService.getSession(sessionId);
        if (!session) {
          return { data: { type: 'error', message: 'Session not found' } } as MessageEvent;
        }

        const newEvents = session.events.slice(lastIndex);
        lastIndex = session.events.length;

        if (newEvents.length > 0) {
          return {
            data: {
              type: 'events',
              events: newEvents,
              status: session.status,
            },
          } as MessageEvent;
        }

        return {
          data: {
            type: 'heartbeat',
            status: session.status,
            eventCount: session.events.length,
          },
        } as MessageEvent;
      }),
      takeWhile((event) => {
        const data = (event as any).data;
        return data.status !== 'completed' && data.status !== 'cancelled' && data.type !== 'error';
      }, true),
    );
  }

  @Post(':sessionId/cancel')
  @ApiOperation({ summary: 'Cancel a replay session' })
  @ApiResponse({ status: 200, description: 'Session cancelled' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async cancelSession(@Param('sessionId') sessionId: string) {
    this.replayService.cancelSession(sessionId);
    return { cancelled: true };
  }
}

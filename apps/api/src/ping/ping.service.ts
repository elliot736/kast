import { Injectable, Logger } from '@nestjs/common';
import { RedpandaService } from '../redpanda/redpanda.service';
import { MonitorService } from '../monitor/monitor.service';
import { TOPICS } from '../redpanda/redpanda.constants';
import type { PingEvent } from '../redpanda/redpanda.interfaces';

@Injectable()
export class PingService {
  private readonly logger = new Logger(PingService.name);

  constructor(
    private redpanda: RedpandaService,
    private monitorService: MonitorService,
  ) {}

  async handlePing(
    pingUuid: string,
    type: 'start' | 'success' | 'fail' | 'log',
    options?: { body?: string; userAgent?: string; sourceIp?: string },
  ) {
    const monitor = await this.monitorService.findByPingUuid(pingUuid);

    const event: PingEvent = {
      monitorId: monitor.id,
      pingUuid,
      type,
      body: options?.body,
      userAgent: options?.userAgent,
      sourceIp: options?.sourceIp,
      timestamp: new Date().toISOString(),
    };

    await this.redpanda.publish(
      TOPICS.PING_EVENTS.name,
      monitor.id,
      event,
    );

    this.logger.debug(`Ping ${type} for monitor ${monitor.name} (${monitor.id})`);

    return { ok: true };
  }
}

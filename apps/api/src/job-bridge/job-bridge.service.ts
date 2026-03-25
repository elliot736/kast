import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS, CONSUMER_GROUPS } from '../redpanda/redpanda.constants';
import { DRIZZLE, type Database } from '../database/database.provider';
import { jobs } from '../database/schema';
import type { JobResultEvent, PingEvent } from '../redpanda/redpanda.interfaces';

@Injectable()
export class JobBridgeService implements OnModuleInit {
  private readonly logger = new Logger(JobBridgeService.name);

  constructor(
    private redpanda: RedpandaService,
    @Inject(DRIZZLE) private db: Database,
  ) {}

  async onModuleInit() {
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.JOB_BRIDGE,
      TOPICS.JOB_RESULTS.name,
      async ({ message }) => {
        const event: JobResultEvent = JSON.parse(message.value!.toString());
        await this.bridge(event);
      },
    );

    this.logger.log('Job bridge consumer started');
  }

  private async bridge(event: JobResultEvent) {
    const [job] = await this.db
      .select()
      .from(jobs)
      .where(eq(jobs.id, event.jobId))
      .limit(1);

    if (!job?.monitorId) return;

    // Translate job result into a synthetic PingEvent
    const pingEvent: PingEvent = {
      monitorId: job.monitorId,
      pingUuid: job.monitorId, // use monitorId as key for partitioning
      type: event.status === 'success' ? 'success' : 'fail',
      body: event.errorMessage,
      userAgent: 'Kast-JobBridge/1.0',
      sourceIp: '127.0.0.1',
      timestamp: event.timestamp,
    };

    await this.redpanda.publish(TOPICS.PING_EVENTS.name, job.monitorId, pingEvent);

    this.logger.debug(
      `Bridged job ${job.id} result (${event.status}) to monitor ${job.monitorId}`,
    );
  }
}

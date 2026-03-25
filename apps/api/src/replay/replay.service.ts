import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer } from 'kafkajs';
import { randomUUID } from 'crypto';
import { TOPICS } from '../redpanda/redpanda.constants';

const MAX_SESSIONS = 50;
const SESSION_TTL_MS = 600_000; // 10 minutes
const MAX_EVENTS_PER_SESSION = 10_000;

export interface ReplaySession {
  id: string;
  topic: string;
  fromTimestamp: number;
  toTimestamp: number;
  monitorId?: string;
  status: 'running' | 'completed' | 'cancelled';
  events: unknown[];
  createdAtMs: number;
}

@Injectable()
export class ReplayService {
  private readonly logger = new Logger(ReplayService.name);
  private sessions = new Map<string, ReplaySession>();
  private kafka: Kafka;

  constructor(private config: ConfigService) {
    this.kafka = new Kafka({
      clientId: 'kast-replay',
      brokers: this.config.get<string[]>('kafka.brokers', ['localhost:29092']),
    });
  }

  private evict() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAtMs > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
    // Trim to MAX_SESSIONS by removing oldest first
    if (this.sessions.size > MAX_SESSIONS) {
      const sorted = [...this.sessions.entries()].sort(
        (a, b) => a[1].createdAtMs - b[1].createdAtMs,
      );
      const toRemove = sorted.length - MAX_SESSIONS;
      for (let i = 0; i < toRemove; i++) {
        this.sessions.delete(sorted[i][0]);
      }
    }
  }

  async createSession(params: {
    fromTimestamp: number;
    toTimestamp: number;
    topic?: string;
    monitorId?: string;
  }): Promise<ReplaySession> {
    this.evict();

    const session: ReplaySession = {
      id: randomUUID(),
      topic: params.topic ?? TOPICS.PING_EVENTS.name,
      fromTimestamp: params.fromTimestamp,
      toTimestamp: params.toTimestamp,
      monitorId: params.monitorId,
      status: 'running',
      events: [],
      createdAtMs: Date.now(),
    };

    this.sessions.set(session.id, session);

    // Run replay in background
    this.runReplay(session).catch((err) => {
      this.logger.error(`Replay session ${session.id} failed: ${err}`);
      session.status = 'completed';
    });

    return session;
  }

  private async runReplay(session: ReplaySession) {
    const groupId = `kast-replay-${session.id}`;
    const consumer = this.kafka.consumer({ groupId });

    try {
      await consumer.connect();
      await consumer.subscribe({ topic: session.topic, fromBeginning: true });

      const admin = this.kafka.admin();
      await admin.connect();

      // Get partition offsets for the time range
      const partitions = await admin.fetchTopicOffsetsByTimestamp(
        session.topic,
        session.fromTimestamp,
      );
      await admin.disconnect();

      // Seek to the starting offsets
      await consumer.run({
        eachMessage: async ({ message, partition }) => {
          if (session.status === 'cancelled') return;

          const timestamp = Number(message.timestamp);
          if (timestamp > session.toTimestamp) {
            session.status = 'completed';
            return;
          }

          if (timestamp >= session.fromTimestamp) {
            if (session.events.length >= MAX_EVENTS_PER_SESSION) {
              session.status = 'completed';
              return;
            }

            try {
              const event = JSON.parse(message.value!.toString());

              // Filter by monitor if specified
              if (session.monitorId && event.monitorId !== session.monitorId) {
                return;
              }

              session.events.push({
                ...event,
                _replay: {
                  partition,
                  offset: message.offset,
                  originalTimestamp: timestamp,
                },
              });
            } catch {
              // Skip unparseable messages
            }
          }
        },
      });

      // Wait a bit then mark complete
      await new Promise((resolve) => setTimeout(resolve, 5000));
      session.status = 'completed';
    } finally {
      await consumer.disconnect();
    }
  }

  getSession(id: string): ReplaySession | undefined {
    return this.sessions.get(id);
  }

  cancelSession(id: string) {
    const session = this.sessions.get(id);
    if (session) {
      session.status = 'cancelled';
    }
  }
}

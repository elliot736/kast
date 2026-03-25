import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer, Admin, EachMessagePayload, Partitioners } from 'kafkajs';
import { TOPICS } from './redpanda.constants';

@Injectable()
export class RedpandaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedpandaService.name);
  private kafka: Kafka;
  private producer: Producer;
  private admin: Admin;
  private consumers: Consumer[] = [];

  constructor(private config: ConfigService) {
    this.kafka = new Kafka({
      clientId: this.config.get<string>('kafka.clientId', 'kast-api'),
      brokers: this.config.get<string[]>('kafka.brokers', ['localhost:29092']),
      retry: { retries: 5 },
    });
    this.producer = this.kafka.producer({
      createPartitioner: Partitioners.DefaultPartitioner,
    });
    this.admin = this.kafka.admin();
  }

  async onModuleInit() {
    await this.admin.connect();
    await this.ensureTopics();
    // Keep admin connected for health checks
    await this.producer.connect();
    this.logger.log('Redpanda producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    for (const consumer of this.consumers) {
      try {
        await consumer.disconnect();
      } catch (err) {
        this.logger.error(
          `Error disconnecting consumer: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }
    try {
      await this.admin.disconnect();
    } catch (err) {
      this.logger.error(
        `Error disconnecting admin: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
    this.logger.log('Redpanda connections closed');
  }

  async healthCheck(): Promise<void> {
    await this.admin.listTopics();
  }

  private async ensureTopics() {
    const existing = await this.admin.listTopics();
    const toCreate = Object.values(TOPICS)
      .filter((t) => !existing.includes(t.name))
      .map((t) => ({
        topic: t.name,
        numPartitions: t.partitions,
        configEntries: [
          {
            name: 'cleanup.policy',
            value: t.cleanup,
          },
          ...(t.retention > 0
            ? [{ name: 'retention.ms', value: String(t.retention) }]
            : []),
        ],
      }));

    if (toCreate.length > 0) {
      await this.admin.createTopics({ topics: toCreate });
      this.logger.log(`Created topics: ${toCreate.map((t) => t.topic).join(', ')}`);
    }
  }

  async publish(topic: string, key: string, value: object): Promise<void> {
    await this.producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(value),
        },
      ],
    });
  }

  async subscribe(
    groupId: string,
    topic: string,
    handler: (payload: EachMessagePayload) => Promise<void>,
  ): Promise<Consumer> {
    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      retry: { retries: 10 },
    });
    this.consumers.push(consumer);

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({
      eachMessage: async (payload) => {
        try {
          await handler(payload);
        } catch (err) {
          this.logger.error(
            `Error processing message from ${topic}: ${err}`,
            (err as Error).stack,
          );
        }
      },
    });

    this.logger.log(`Consumer ${groupId} subscribed to ${topic}`);
    return consumer;
  }
}

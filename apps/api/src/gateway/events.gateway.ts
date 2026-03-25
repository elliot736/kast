import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RedpandaService } from '../redpanda/redpanda.service';
import { TOPICS, CONSUMER_GROUPS } from '../redpanda/redpanda.constants';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/events',
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private connectedClients = 0;

  constructor(private redpanda: RedpandaService) {}

  private safeParse(raw: Buffer | null): Record<string, unknown> | null {
    try {
      return JSON.parse(raw!.toString());
    } catch {
      return null;
    }
  }

  async onModuleInit() {
    const subscribe = async (
      group: string,
      topic: string,
      eventName: string,
    ) => {
      await this.redpanda.subscribe(group, topic, async ({ message }) => {
        if (this.connectedClients > 0) {
          const event = this.safeParse(message.value);
          if (event) this.server.emit(eventName, event);
        }
      });
    };

    await subscribe(CONSUMER_GROUPS.WS_PING, TOPICS.PING_EVENTS.name, 'ping');
    await subscribe(CONSUMER_GROUPS.WS_STATE, TOPICS.MONITOR_STATE.name, 'monitor-state');
    await subscribe(CONSUMER_GROUPS.WS_INCIDENTS, TOPICS.INCIDENT_EVENTS.name, 'incident');
    await subscribe(CONSUMER_GROUPS.WS_JOB_RESULTS, TOPICS.JOB_RESULTS.name, 'job-run');
    await subscribe(CONSUMER_GROUPS.WS_JOB_LOGS, TOPICS.JOB_RUN_LOGS.name, 'job-log');
    await subscribe(CONSUMER_GROUPS.WS_WORKFLOW_STEPS, TOPICS.WORKFLOW_STEP_RESULTS.name, 'workflow-step');

    this.logger.log('WebSocket gateway consumers started');
  }

  afterInit() {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    this.connectedClients++;
    this.logger.debug(`Client connected: ${client.id} (${this.connectedClients} total)`);
  }

  handleDisconnect(client: Socket) {
    this.connectedClients--;
    this.logger.debug(`Client disconnected: ${client.id} (${this.connectedClients} total)`);
  }
}

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

  async onModuleInit() {
    // Subscribe to ping events and push to connected browsers
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.WS_PING,
      TOPICS.PING_EVENTS.name,
      async ({ message }) => {
        if (this.connectedClients > 0) {
          const event = JSON.parse(message.value!.toString());
          this.server.emit('ping', event);
        }
      },
    );

    // Subscribe to monitor state changes
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.WS_STATE,
      TOPICS.MONITOR_STATE.name,
      async ({ message }) => {
        if (this.connectedClients > 0) {
          const event = JSON.parse(message.value!.toString());
          this.server.emit('monitor-state', event);
        }
      },
    );

    // Subscribe to incident events
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.WS_INCIDENTS,
      TOPICS.INCIDENT_EVENTS.name,
      async ({ message }) => {
        if (this.connectedClients > 0) {
          const event = JSON.parse(message.value!.toString());
          this.server.emit('incident', event);
        }
      },
    );

    // Subscribe to job result events
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.WS_JOB_RESULTS,
      TOPICS.JOB_RESULTS.name,
      async ({ message }) => {
        if (this.connectedClients > 0) {
          const event = JSON.parse(message.value!.toString());
          this.server.emit('job-run', event);
        }
      },
    );

    // Subscribe to job run log events
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.WS_JOB_LOGS,
      TOPICS.JOB_RUN_LOGS.name,
      async ({ message }) => {
        if (this.connectedClients > 0) {
          const event = JSON.parse(message.value!.toString());
          this.server.emit('job-log', event);
        }
      },
    );

    // Subscribe to workflow step result events
    await this.redpanda.subscribe(
      CONSUMER_GROUPS.WS_WORKFLOW_STEPS,
      TOPICS.WORKFLOW_STEP_RESULTS.name,
      async ({ message }) => {
        if (this.connectedClients > 0) {
          const event = JSON.parse(message.value!.toString());
          this.server.emit('workflow-step', event);
        }
      },
    );

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

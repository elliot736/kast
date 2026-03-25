import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  public readonly registry: Registry;
  public readonly pingEventsTotal: Counter;
  public readonly incidentsOpenedTotal: Counter;
  public readonly alertDeliveriesTotal: Counter;
  public readonly httpRequestDuration: Histogram;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.pingEventsTotal = new Counter({
      name: 'kast_ping_events_total',
      help: 'Total ping events processed',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.incidentsOpenedTotal = new Counter({
      name: 'kast_incidents_opened_total',
      help: 'Total incidents opened',
      registers: [this.registry],
    });

    this.alertDeliveriesTotal = new Counter({
      name: 'kast_alert_deliveries_total',
      help: 'Total alert delivery attempts',
      labelNames: ['channel', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'kast_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry],
    });
  }
}

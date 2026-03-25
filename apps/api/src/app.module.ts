import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedpandaModule } from './redpanda/redpanda.module';
import { AuthModule } from './auth/auth.module';
import { MonitorModule } from './monitor/monitor.module';
import { PingModule } from './ping/ping.module';
import { SinkModule } from './sink/sink.module';
import { ScheduleModule } from './schedule/schedule.module';
import { IncidentModule } from './incident/incident.module';
import { AlertModule } from './alert/alert.module';
import { NotifyModule } from './notify/notify.module';
import { GatewayModule } from './gateway/gateway.module';
import { ReplayModule } from './replay/replay.module';
import { TeamModule } from './team/team.module';
import { StatusModule } from './status/status.module';
import { JobModule } from './job/job.module';
import { JobSchedulerModule } from './job-scheduler/job-scheduler.module';
import { JobExecutorModule } from './job-executor/job-executor.module';
import { JobBridgeModule } from './job-bridge/job-bridge.module';
import { JobRetryModule } from './job-retry/job-retry.module';
import { JobLogSinkModule } from './job-log-sink/job-log-sink.module';
import { WorkflowModule } from './workflow/workflow.module';
import { WorkflowEngineModule } from './workflow-engine/workflow-engine.module';
import { WorkflowSleeperModule } from './workflow-sleeper/workflow-sleeper.module';
import { WorkflowEventMatcherModule } from './workflow-event-matcher/workflow-event-matcher.module';
import { HealthController } from './health.controller';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { MetricsModule } from './common/metrics/metrics.module';

@Module({
  imports: [
    AppConfigModule,
    MetricsModule,
    DatabaseModule,
    RedpandaModule,
    AuthModule,
    MonitorModule,
    PingModule,
    SinkModule,
    ScheduleModule,
    IncidentModule,
    AlertModule,
    NotifyModule,
    GatewayModule,
    ReplayModule,
    TeamModule,
    StatusModule,
    JobModule,
    JobSchedulerModule,
    JobExecutorModule,
    JobBridgeModule,
    JobRetryModule,
    JobLogSinkModule,
    WorkflowModule,
    WorkflowEngineModule,
    WorkflowSleeperModule,
    WorkflowEventMatcherModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

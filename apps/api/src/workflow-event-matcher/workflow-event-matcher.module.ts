import { Module } from '@nestjs/common';
import { WorkflowEventMatcherService } from './workflow-event-matcher.service';

@Module({
  providers: [WorkflowEventMatcherService],
})
export class WorkflowEventMatcherModule {}

import { Module } from '@nestjs/common';
import { WorkflowEngineService } from './workflow-engine.service';

@Module({
  providers: [WorkflowEngineService],
})
export class WorkflowEngineModule {}

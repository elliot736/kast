import { Module } from '@nestjs/common';
import { WorkflowSleeperService } from './workflow-sleeper.service';

@Module({
  providers: [WorkflowSleeperService],
})
export class WorkflowSleeperModule {}

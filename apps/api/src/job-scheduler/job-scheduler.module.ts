import { Module } from '@nestjs/common';
import { JobSchedulerService } from './job-scheduler.service';

@Module({
  providers: [JobSchedulerService],
})
export class JobSchedulerModule {}

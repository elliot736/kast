import { Module } from '@nestjs/common';
import { JobExecutorService } from './job-executor.service';

@Module({
  providers: [JobExecutorService],
})
export class JobExecutorModule {}

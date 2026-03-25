import { Module } from '@nestjs/common';
import { JobRetryService } from './job-retry.service';

@Module({
  providers: [JobRetryService],
})
export class JobRetryModule {}

import { Module } from '@nestjs/common';
import { JobLogSinkService } from './job-log-sink.service';

@Module({
  providers: [JobLogSinkService],
})
export class JobLogSinkModule {}

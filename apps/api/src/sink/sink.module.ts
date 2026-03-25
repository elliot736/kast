import { Module } from '@nestjs/common';
import { SinkService } from './sink.service';
import { RetentionService } from './retention.service';

@Module({
  providers: [SinkService, RetentionService],
})
export class SinkModule {}

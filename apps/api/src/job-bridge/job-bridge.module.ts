import { Module } from '@nestjs/common';
import { JobBridgeService } from './job-bridge.service';

@Module({
  providers: [JobBridgeService],
})
export class JobBridgeModule {}

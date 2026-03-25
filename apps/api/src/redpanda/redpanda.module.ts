import { Global, Module } from '@nestjs/common';
import { RedpandaService } from './redpanda.service';

@Global()
@Module({
  providers: [RedpandaService],
  exports: [RedpandaService],
})
export class RedpandaModule {}

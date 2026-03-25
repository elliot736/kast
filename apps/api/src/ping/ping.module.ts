import { Module } from '@nestjs/common';
import { PingController } from './ping.controller';
import { PingService } from './ping.service';
import { MonitorModule } from '../monitor/monitor.module';

@Module({
  imports: [MonitorModule],
  controllers: [PingController],
  providers: [PingService],
})
export class PingModule {}

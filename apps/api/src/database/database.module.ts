import { Global, Module } from '@nestjs/common';
import { databaseProvider, DRIZZLE } from './database.provider';

@Global()
@Module({
  providers: [databaseProvider],
  exports: [DRIZZLE],
})
export class DatabaseModule {}

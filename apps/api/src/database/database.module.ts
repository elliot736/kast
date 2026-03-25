import { Global, Module, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { poolProvider, databaseProvider, DB_POOL, DRIZZLE } from './database.provider';

@Global()
@Module({
  providers: [poolProvider, databaseProvider],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(DB_POOL) private pool: Pool) {}

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('Database pool closed');
  }
}

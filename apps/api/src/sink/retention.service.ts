import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { lt } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.provider';
import { pings } from '../database/schema';

const DEFAULT_RETENTION_DAYS = 30;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(@Inject(DRIZZLE) private db: Database) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldPings() {
    const retentionDays = Number(process.env.PING_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS;
    const cutoff = new Date(Date.now() - retentionDays * 86400000);

    const deleted = await this.db
      .delete(pings)
      .where(lt(pings.createdAt, cutoff))
      .returning({ id: pings.id });

    if (deleted.length > 0) {
      this.logger.log(
        `Retention cleanup: deleted ${deleted.length} pings older than ${retentionDays} days`,
      );
    }
  }
}

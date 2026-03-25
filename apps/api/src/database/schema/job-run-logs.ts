import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { jobRuns } from './job-runs';

export const jobRunLogs = pgTable(
  'job_run_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id')
      .references(() => jobRuns.id, { onDelete: 'cascade' })
      .notNull(),
    level: varchar('level', { length: 10 }).notNull(),
    message: text('message').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('job_run_logs_run_idx').on(table.runId),
    index('job_run_logs_timestamp_idx').on(table.timestamp),
  ],
);

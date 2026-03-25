import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

export const runStatusEnum = pgEnum('run_status', [
  'scheduled',
  'running',
  'success',
  'failed',
  'timeout',
  'cancelled',
]);

export const runTriggerEnum = pgEnum('run_trigger', [
  'cron',
  'manual',
  'retry',
]);

export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .references(() => jobs.id, { onDelete: 'cascade' })
      .notNull(),
    status: runStatusEnum('status').default('scheduled').notNull(),
    trigger: runTriggerEnum('trigger').default('cron').notNull(),

    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),

    // HTTP response details
    httpStatus: integer('http_status'),
    responseBody: text('response_body'),
    errorMessage: text('error_message'),

    attempt: integer('attempt').default(1),

    // Queue tracking
    queuedAt: timestamp('queued_at', { withTimezone: true }),

    // Retry chain
    parentRunId: uuid('parent_run_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('job_runs_job_idx').on(table.jobId),
    index('job_runs_status_idx').on(table.status),
    index('job_runs_scheduled_at_idx').on(table.scheduledAt),
    index('job_runs_job_created_idx').on(table.jobId, table.createdAt),
  ],
);

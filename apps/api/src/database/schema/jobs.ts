import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { monitors } from './monitors';
import { teams } from './teams';

export const jobStatusEnum = pgEnum('job_status', [
  'active',
  'paused',
  'disabled',
]);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    description: text('description'),
    schedule: varchar('schedule', { length: 255 }).notNull(),
    timezone: varchar('timezone', { length: 100 }).default('UTC'),
    status: jobStatusEnum('status').default('active').notNull(),

    // HTTP trigger config
    url: text('url').notNull(),
    method: varchar('method', { length: 10 }).default('POST'),
    headers: jsonb('headers').$type<Record<string, string>>().default({}),
    body: text('body'),
    timeoutSeconds: integer('timeout_seconds').default(30),

    // Retry policy
    maxRetries: integer('max_retries').default(0),
    retryDelaySeconds: integer('retry_delay_seconds').default(60),
    retryBackoffMultiplier: integer('retry_backoff_multiplier').default(2),
    retryMaxDelaySeconds: integer('retry_max_delay_seconds').default(3600),

    // Concurrency control
    concurrencyLimit: integer('concurrency_limit').default(1),
    concurrencyPolicy: varchar('concurrency_policy', { length: 20 }).default('queue'),
    successStatusCodes: jsonb('success_status_codes').$type<number[]>().default([200, 201, 202, 204]),

    // Bridge to monitoring
    monitorId: uuid('monitor_id').references(() => monitors.id, { onDelete: 'set null' }),

    // Ownership
    teamId: uuid('team_id').references(() => teams.id),
    tags: jsonb('tags').$type<string[]>().default([]),

    // Scheduling state
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('jobs_status_idx').on(table.status),
    index('jobs_next_run_at_idx').on(table.nextRunAt),
    index('jobs_monitor_id_idx').on(table.monitorId),
  ],
);

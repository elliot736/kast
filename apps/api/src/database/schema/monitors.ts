import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { teams } from './teams';

export const monitorStatusEnum = pgEnum('monitor_status', [
  'healthy',
  'late',
  'down',
  'paused',
]);

export const monitors = pgTable(
  'monitors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    pingUuid: uuid('ping_uuid').defaultRandom().notNull().unique(),
    description: text('description'),
    schedule: varchar('schedule', { length: 255 }),
    intervalSeconds: integer('interval_seconds'),
    graceSeconds: integer('grace_seconds').default(300),
    maxRuntimeSeconds: integer('max_runtime_seconds'),
    status: monitorStatusEnum('status').default('healthy').notNull(),
    tags: jsonb('tags').$type<string[]>().default([]),
    teamId: uuid('team_id').references(() => teams.id),
    logRetentionDays: integer('log_retention_days').default(30),
    lastPingAt: timestamp('last_ping_at', { withTimezone: true }),
    nextExpectedAt: timestamp('next_expected_at', { withTimezone: true }),
    consecutiveFailures: integer('consecutive_failures').default(0),
    isPaused: boolean('is_paused').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('monitors_status_idx').on(table.status),
    index('monitors_ping_uuid_idx').on(table.pingUuid),
  ],
);

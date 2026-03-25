import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { monitors } from './monitors';

export const incidentStatusEnum = pgEnum('incident_status', [
  'open',
  'acknowledged',
  'resolved',
]);

export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    monitorId: uuid('monitor_id')
      .references(() => monitors.id, { onDelete: 'cascade' })
      .notNull(),
    status: incidentStatusEnum('status').default('open').notNull(),
    reason: varchar('reason', { length: 255 }),
    missedPingsCount: integer('missed_pings_count').default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: varchar('acknowledged_by', { length: 255 }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    downtimeSeconds: integer('downtime_seconds'),
  },
  (table) => [
    index('incidents_monitor_idx').on(table.monitorId),
    index('incidents_status_idx').on(table.status),
  ],
);

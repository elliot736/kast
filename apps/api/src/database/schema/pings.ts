import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { monitors } from './monitors';

export const pingTypeEnum = pgEnum('ping_type', [
  'start',
  'success',
  'fail',
  'log',
]);

export const pings = pgTable(
  'pings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    monitorId: uuid('monitor_id')
      .references(() => monitors.id, { onDelete: 'cascade' })
      .notNull(),
    type: pingTypeEnum('type').notNull(),
    body: text('body'),
    durationMs: integer('duration_ms'),
    userAgent: varchar('user_agent', { length: 255 }),
    sourceIp: varchar('source_ip', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('pings_monitor_idx').on(table.monitorId),
    index('pings_created_at_idx').on(table.createdAt),
    index('pings_monitor_created_idx').on(table.monitorId, table.createdAt),
  ],
);

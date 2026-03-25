import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { monitors } from './monitors';

export const alertChannelEnum = pgEnum('alert_channel', [
  'slack',
  'discord',
  'email',
  'webhook',
  'pagerduty',
  'telegram',
]);

export const alertConfigs = pgTable('alert_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  monitorId: uuid('monitor_id')
    .references(() => monitors.id, { onDelete: 'cascade' })
    .notNull(),
  channel: alertChannelEnum('channel').notNull(),
  destination: text('destination').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().default({}),
  cooldownMinutes: integer('cooldown_minutes').default(30),
  thresholdFailures: integer('threshold_failures').default(1),
  isEnabled: boolean('is_enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

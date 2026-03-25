import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { incidents } from './incidents';
import { alertConfigs } from './alert-configs';
import { alertChannelEnum } from './alert-configs';

export const alertDeliveryStatusEnum = pgEnum('alert_delivery_status', [
  'sent',
  'failed',
  'retrying',
]);

export const alertLog = pgTable(
  'alert_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    incidentId: uuid('incident_id')
      .references(() => incidents.id)
      .notNull(),
    alertConfigId: uuid('alert_config_id')
      .references(() => alertConfigs.id)
      .notNull(),
    channel: alertChannelEnum('channel').notNull(),
    status: alertDeliveryStatusEnum('status').notNull(),
    attempts: integer('attempts').default(1),
    lastError: text('last_error'),
    response: jsonb('response'),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('alert_log_incident_idx').on(table.incidentId),
    index('alert_log_status_idx').on(table.status),
  ],
);

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { workflowRuns } from './workflow-runs';

export const workflowSignals = pgTable(
  'workflow_signal',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    targetRunId: uuid('target_run_id')
      .references(() => workflowRuns.id, { onDelete: 'cascade' })
      .notNull(),
    sourceRunId: uuid('source_run_id'),
    sourceStepId: varchar('source_step_id', { length: 255 }),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
    delivered: boolean('delivered').default(false).notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ws_target_idx').on(table.targetRunId, table.delivered),
  ],
);

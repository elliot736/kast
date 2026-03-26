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
import { workflowRuns } from './workflow-runs';

export const stepResultStatusEnum = pgEnum('step_result_status', [
  'completed',
  'failed',
  'skipped',
]);

export const workflowStepResults = pgTable(
  'workflow_step_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowRunId: uuid('workflow_run_id')
      .references(() => workflowRuns.id, { onDelete: 'cascade' })
      .notNull(),
    stepId: varchar('step_id', { length: 255 }).notNull(),
    stepIndex: integer('step_index').notNull(),
    status: stepResultStatusEnum('status').notNull(),

    iteration: integer('iteration').default(1),
    output: jsonb('output').$type<unknown>(),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),

    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('wsr_run_idx').on(table.workflowRunId),
    index('wsr_run_step_idx').on(table.workflowRunId, table.stepIndex),
    index('wsr_run_step_id_idx').on(table.workflowRunId, table.stepId),
  ],
);

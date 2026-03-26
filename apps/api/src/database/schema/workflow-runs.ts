import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { workflows } from './workflows';
import { jobRuns } from './job-runs';

export const workflowRunStatusEnum = pgEnum('workflow_run_status', [
  'running',
  'sleeping',
  'waiting',
  'completed',
  'failed',
  'cancelled',
]);

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id')
      .references(() => workflows.id, { onDelete: 'cascade' })
      .notNull(),
    jobRunId: uuid('job_run_id')
      .references(() => jobRuns.id, { onDelete: 'cascade' })
      .notNull(),
    status: workflowRunStatusEnum('status').default('running').notNull(),

    currentStepIndex: integer('current_step_index').default(0),
    currentStepId: varchar('current_step_id', { length: 255 }),
    completedNodes: jsonb('completed_nodes').$type<string[]>().default([]),
    loopCounters: jsonb('loop_counters').$type<Record<string, number>>().default({}),
    context: jsonb('context').$type<Record<string, unknown>>().default({}),

    // Sleep state
    resumeAt: timestamp('resume_at', { withTimezone: true }),

    // Signal wait state
    waitTimeoutAt: timestamp('wait_timeout_at', { withTimezone: true }),

    // Child workflow tracking
    waitingForChildRunId: uuid('waiting_for_child_run_id'),

    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('workflow_runs_workflow_idx').on(table.workflowId),
    index('workflow_runs_status_idx').on(table.status),
    index('workflow_runs_resume_at_idx').on(table.resumeAt),
  ],
);

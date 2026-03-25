import {
  pgTable,
  uuid,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import type { WorkflowStepDefinition } from '../../workflow/workflow.types';

export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .references(() => jobs.id, { onDelete: 'cascade' })
      .notNull(),
    version: integer('version').default(1).notNull(),
    steps: jsonb('steps').$type<WorkflowStepDefinition[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('workflows_job_idx').on(table.jobId),
    index('workflows_job_version_idx').on(table.jobId, table.version),
  ],
);

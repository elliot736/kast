import { z } from 'zod';

// --- Node configs (mirrors API workflow.dto.ts) ---

const runNodeConfigSchema = z.object({
  url: z.string(),
  method: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeoutSeconds: z.number().int().positive().optional(),
  successStatusCodes: z.array(z.number().int()).optional(),
});

const sleepNodeConfigSchema = z.object({
  duration: z.string().min(1),
});

const conditionNodeConfigSchema = z.object({
  expression: z.string().min(1),
});

const runJobNodeConfigSchema = z.object({
  targetJob: z.string().min(1), // slug — resolved to UUID at apply time
  mode: z.enum(['wait', 'fire_and_forget']),
  input: z.record(z.unknown()).optional(),
});

const fanOutNodeConfigSchema = z.object({
  concurrency: z.number().int().positive().optional(),
  failFast: z.boolean().optional(),
});

const emptyConfigSchema = z.object({}).passthrough();

const retryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  delaySeconds: z.number().int().positive(),
  backoffMultiplier: z.number().positive(),
});

// --- Graph workflow schema ---

const nodeSchema = z.object({
  id: z.string().min(1).max(255),
  name: z.string().max(255).optional(),
  type: z.enum(['run', 'sleep', 'condition', 'run_job', 'fan_out', 'webhook_wait']),
  config: z.union([
    runNodeConfigSchema.passthrough(),
    sleepNodeConfigSchema.passthrough(),
    conditionNodeConfigSchema.passthrough(),
    runJobNodeConfigSchema.passthrough(),
    fanOutNodeConfigSchema.passthrough(),
    emptyConfigSchema,
  ]).default({}),
  retryPolicy: retryPolicySchema.optional(),
  onFailure: z.enum(['abort', 'continue']).optional(),
});

const loopEdgeConfigSchema = z.object({
  maxIterations: z.number().int().min(1).max(100),
  untilExpression: z.string().min(1),
});

const edgeSchema = z.object({
  source: z.string().min(1),
  sourceHandle: z.string().optional(),
  target: z.string().min(1),
  label: z.string().optional(),
  loop: loopEdgeConfigSchema.optional(),
});

const workflowSchema = z.object({
  nodes: z.array(nodeSchema).min(1).max(100),
  edges: z.array(edgeSchema).max(200),
});

// --- Alert config ---

const alertSchema = z.object({
  channel: z.enum(['slack', 'discord', 'email', 'webhook', 'pagerduty', 'telegram']),
  destination: z.string().min(1),
  config: z.record(z.unknown()).default({}),
  cooldownMinutes: z.number().int().positive().default(30),
  thresholdFailures: z.number().int().positive().default(1),
  isEnabled: z.boolean().default(true),
});

// --- Monitor ---

const monitorSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  schedule: z.string().optional(),
  intervalSeconds: z.number().int().positive().optional(),
  graceSeconds: z.number().int().positive().default(300),
  maxRuntimeSeconds: z.number().int().positive().optional(),
  tags: z.array(z.string()).default([]),
  team: z.string().optional(), // team slug ref
  logRetentionDays: z.number().int().positive().optional(),
  alerts: z.array(alertSchema).default([]),
});

// --- Job ---

const retrySchema = z.object({
  maxRetries: z.number().int().min(0).max(10).default(0),
  delaySeconds: z.number().int().positive().default(60),
  backoffMultiplier: z.number().positive().default(2),
  maxDelaySeconds: z.number().int().positive().default(3600),
});

const concurrencySchema = z.object({
  limit: z.number().int().positive().default(1),
  policy: z.enum(['queue', 'skip', 'cancel']).default('queue'),
});

const jobSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  schedule: z.string().min(1),
  timezone: z.string().max(100).default('UTC'),
  tags: z.array(z.string()).default([]),
  team: z.string().optional(),     // team slug ref
  monitor: z.string().optional(),  // monitor slug ref
  retry: retrySchema.default({}),
  concurrency: concurrencySchema.default({}),
  workflow: workflowSchema.optional(),
});

// --- Team ---

const teamSchema = z.object({
  name: z.string().min(1).max(255),
});

// --- Root config ---

export const kastConfigSchema = z.object({
  version: z.literal('1'),
  teams: z.record(teamSchema).default({}),
  monitors: z.record(monitorSchema).default({}),
  jobs: z.record(jobSchema).default({}),
});

// --- Exported types ---

export type KastConfig = z.infer<typeof kastConfigSchema>;
export type MonitorDef = z.infer<typeof monitorSchema>;
export type JobDef = z.infer<typeof jobSchema>;
export type TeamDef = z.infer<typeof teamSchema>;
export type AlertDef = z.infer<typeof alertSchema>;
export type WorkflowDef = z.infer<typeof workflowSchema>;
export type NodeDef = z.infer<typeof nodeSchema>;
export type EdgeDef = z.infer<typeof edgeSchema>;

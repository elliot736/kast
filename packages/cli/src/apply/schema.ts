import { z } from 'zod';

// --- Step configs (mirrors API workflow.dto.ts) ---

const runStepConfigSchema = z.object({
  url: z.string(),
  method: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeoutSeconds: z.number().int().positive().optional(),
  successStatusCodes: z.array(z.number().int()).optional(),
});

const sleepStepConfigSchema = z.object({
  duration: z.string().min(1),
});

const spawnStepConfigSchema = z.object({
  targetJob: z.string().min(1), // slug — resolved to UUID at apply time
  waitForCompletion: z.boolean(),
  input: z.record(z.unknown()).optional(),
});

const signalParentStepConfigSchema = z.object({
  payload: z.record(z.unknown()).optional(),
});

const signalChildStepConfigSchema = z.object({
  spawnStepId: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
});

const waitForSignalStepConfigSchema = z.object({
  timeoutDuration: z.string().optional(),
});

const fanOutBranchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  config: runStepConfigSchema,
});

const fanOutStepConfigSchema = z.object({
  branches: z.array(fanOutBranchSchema).min(1).max(50),
  concurrency: z.number().int().positive().optional(),
  failFast: z.boolean().optional(),
});

const retryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  delaySeconds: z.number().int().positive(),
  backoffMultiplier: z.number().positive(),
});

const stepSchema = z.object({
  id: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  type: z.enum(['run', 'sleep', 'spawn', 'signal_parent', 'signal_child', 'wait_for_signal', 'fan_out']),
  config: z.union([
    runStepConfigSchema.passthrough(),
    sleepStepConfigSchema.passthrough(),
    spawnStepConfigSchema.passthrough(),
    signalParentStepConfigSchema.passthrough(),
    signalChildStepConfigSchema.passthrough(),
    waitForSignalStepConfigSchema.passthrough(),
    fanOutStepConfigSchema.passthrough(),
  ]),
  retryPolicy: retryPolicySchema.optional(),
  onFailure: z.enum(['abort', 'continue', 'goto']).optional(),
  onFailureGoto: z.string().optional(),
});

const workflowSchema = z.object({
  steps: z.array(stepSchema).min(1).max(50),
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
  url: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  headers: z.record(z.string()).default({}),
  body: z.string().optional(),
  timeoutSeconds: z.number().int().positive().max(300).default(30),
  tags: z.array(z.string()).default([]),
  team: z.string().optional(),     // team slug ref
  monitor: z.string().optional(),  // monitor slug ref
  retry: retrySchema.default({}),
  concurrency: concurrencySchema.default({}),
  successStatusCodes: z.array(z.number().int().positive()).default([200, 201, 202, 204]),
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
export type StepDef = z.infer<typeof stepSchema>;

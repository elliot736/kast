import { z } from 'zod';

// ── Node configs ────────────────────────────────────────────

const runNodeConfigSchema = z.object({
  url: z.string().url(),
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
  targetJobId: z.string().uuid(),
  mode: z.enum(['wait', 'fire_and_forget']),
  input: z.record(z.unknown()).optional(),
});

const fanOutNodeConfigSchema = z.object({
  concurrency: z.number().int().positive().optional(),
  failFast: z.boolean().optional(),
});

const webhookWaitConfigSchema = z.object({
  timeoutDuration: z.string().optional(),
});

const emptyConfigSchema = z.object({}).passthrough();

// ── Retry policy ────────────────────────────────────────────

const retryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  delaySeconds: z.number().int().positive(),
  backoffMultiplier: z.number().positive(),
});

// ── Graph schema ────────────────────────────────────────────

const nodeDefinitionSchema = z.object({
  id: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  type: z.enum(['start', 'run', 'sleep', 'condition', 'run_job', 'fan_out', 'end', 'webhook_wait']), // start/end kept for backward compat
  config: z.union([
    runNodeConfigSchema.passthrough(),
    sleepNodeConfigSchema.passthrough(),
    conditionNodeConfigSchema.passthrough(),
    runJobNodeConfigSchema.passthrough(),
    fanOutNodeConfigSchema.passthrough(),
    webhookWaitConfigSchema.passthrough(),
    emptyConfigSchema,
  ]),
  retryPolicy: retryPolicySchema.optional(),
  onFailure: z.enum(['abort', 'continue']).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const loopEdgeConfigSchema = z.object({
  maxIterations: z.number().int().min(1).max(100),
  untilExpression: z.string().min(1),
});

const edgeDefinitionSchema = z.object({
  id: z.string().min(1).max(255),
  source: z.string().min(1),
  sourceHandle: z.string().optional(),
  target: z.string().min(1),
  label: z.string().optional(),
  loop: loopEdgeConfigSchema.optional(),
});

export const createWorkflowSchema = z.object({
  steps: z.object({
    nodes: z.array(nodeDefinitionSchema).min(1).max(100),
    edges: z.array(edgeDefinitionSchema).max(200),
  }),
});

// ── Legacy schema (for backward compat) ─────────────────────

const legacyStepSchema = z.object({
  id: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  type: z.enum(['run', 'sleep', 'spawn', 'signal_parent', 'signal_child', 'wait_for_signal', 'fan_out', 'condition', 'loop']),
  config: z.record(z.unknown()),
  retryPolicy: retryPolicySchema.optional(),
  onFailure: z.enum(['abort', 'continue', 'goto']).optional(),
  onFailureGoto: z.string().optional(),
});

export const legacyWorkflowSchema = z.object({
  steps: z.array(legacyStepSchema).min(1).max(50),
});

// ── Signal schema ───────────────────────────────────────────

export const sendSignalSchema = z.object({
  payload: z.record(z.unknown()).optional(),
});

// ── Types ───────────────────────────────────────────────────

export type CreateWorkflowDto = z.infer<typeof createWorkflowSchema>;
export type SendSignalDto = z.infer<typeof sendSignalSchema>;

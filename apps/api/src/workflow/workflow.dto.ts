import { z } from 'zod';

const runStepConfigSchema = z.object({
  url: z.string().url(),
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
  targetJobId: z.string().uuid(),
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

const stepDefinitionSchema = z.object({
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

export const createWorkflowSchema = z.object({
  steps: z.array(stepDefinitionSchema).min(1).max(50),
});

export const sendSignalSchema = z.object({
  payload: z.record(z.unknown()).optional(),
});

export type CreateWorkflowDto = z.infer<typeof createWorkflowSchema>;
export type SendSignalDto = z.infer<typeof sendSignalSchema>;

export interface RunStepConfig {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutSeconds?: number;
  successStatusCodes?: number[];
}

export interface SleepStepConfig {
  duration: string; // ISO 8601 duration, e.g., 'PT5M', 'P1D'
}

export interface SpawnStepConfig {
  targetJobId: string;
  waitForCompletion: boolean;
  input?: Record<string, unknown>;
}

export interface SignalParentStepConfig {
  payload?: Record<string, unknown>;
}

export interface SignalChildStepConfig {
  spawnStepId: string; // references the spawn step that created the child
  payload?: Record<string, unknown>;
}

export interface WaitForSignalStepConfig {
  timeoutDuration?: string; // ISO 8601
}

export interface FanOutStepConfig {
  branches: {
    id: string;
    name: string;
    config: RunStepConfig;
  }[];
  concurrency?: number;
  failFast?: boolean;
}

export interface StepRetryPolicy {
  maxAttempts: number;
  delaySeconds: number;
  backoffMultiplier: number;
}

export type StepType = 'run' | 'sleep' | 'spawn' | 'signal_parent' | 'signal_child' | 'wait_for_signal' | 'fan_out';

export type StepConfig =
  | RunStepConfig
  | SleepStepConfig
  | SpawnStepConfig
  | SignalParentStepConfig
  | SignalChildStepConfig
  | WaitForSignalStepConfig
  | FanOutStepConfig;

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  type: StepType;
  config: StepConfig;
  retryPolicy?: StepRetryPolicy;
  onFailure?: 'abort' | 'continue' | 'goto';
  onFailureGoto?: string;
}

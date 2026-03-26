// ── Node configs ─────────────────────────────────────────────

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

export interface ConditionNodeConfig {
  expression: string;
}

export interface RunJobConfig {
  targetJobId: string;
  mode: 'wait' | 'fire_and_forget';
  input?: Record<string, unknown>;
}

export interface FanOutNodeConfig {
  concurrency?: number;
  failFast?: boolean;
}

// ── Retry policy ─────────────────────────────────────────────

export interface StepRetryPolicy {
  maxAttempts: number;
  delaySeconds: number;
  backoffMultiplier: number;
}

// ── Graph model ──────────────────────────────────────────────

export interface WebhookWaitConfig {
  timeoutDuration?: string; // ISO 8601, optional
}

export type NodeType = 'run' | 'sleep' | 'condition' | 'run_job' | 'fan_out' | 'webhook_wait';

export type NodeConfig =
  | RunStepConfig
  | SleepStepConfig
  | ConditionNodeConfig
  | RunJobConfig
  | FanOutNodeConfig
  | WebhookWaitConfig
  | Record<string, never>;

export interface WorkflowNodeDefinition {
  id: string;
  name: string;
  type: NodeType;
  config: NodeConfig;
  retryPolicy?: StepRetryPolicy;
  onFailure?: 'abort' | 'continue';
  position?: { x: number; y: number };
}

export interface LoopEdgeConfig {
  maxIterations: number;
  untilExpression: string;
}

export interface WorkflowEdgeDefinition {
  id: string;
  source: string;
  sourceHandle?: string; // 'default' | 'true' | 'false'
  target: string;
  label?: string;
  loop?: LoopEdgeConfig;
}

export interface WorkflowGraph {
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
}

// ── Legacy types (kept for backward compat during migration) ─

/** @deprecated Use WorkflowNodeDefinition + WorkflowEdgeDefinition */
export type StepType = 'run' | 'sleep' | 'spawn' | 'signal_parent' | 'signal_child' | 'wait_for_signal' | 'fan_out' | 'condition' | 'loop';

/** @deprecated Use WorkflowNodeDefinition */
export interface WorkflowStepDefinition {
  id: string;
  name: string;
  type: StepType;
  config: Record<string, unknown>;
  retryPolicy?: StepRetryPolicy;
  onFailure?: 'abort' | 'continue' | 'goto';
  onFailureGoto?: string;
}

// Legacy config types (still needed by migration code)
export interface SpawnStepConfig {
  targetJobId: string;
  waitForCompletion: boolean;
  input?: Record<string, unknown>;
}
export interface SignalParentStepConfig { payload?: Record<string, unknown>; }
export interface SignalChildStepConfig { spawnStepId: string; payload?: Record<string, unknown>; }
export interface WaitForSignalStepConfig { timeoutDuration?: string; }
export interface OldConditionStepConfig { expression: string; thenGoto: string; elseGoto: string; }
export interface LoopStepConfig { targetStepId: string; untilExpression: string; maxIterations: number; }
export interface FanOutStepConfig {
  branches: { id: string; name: string; config: RunStepConfig; }[];
  concurrency?: number;
  failFast?: boolean;
}

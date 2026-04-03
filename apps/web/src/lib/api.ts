// Use empty string for same-origin requests (proxied via next.config.ts rewrites)
// Falls back to direct API URL if set explicitly
const API_BASE = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

export async function api<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `API error: ${res.status}`);
  }

  return res.json();
}

export interface Monitor {
  id: string;
  name: string;
  slug: string;
  pingUuid: string;
  description: string | null;
  schedule: string | null;
  intervalSeconds: number | null;
  graceSeconds: number | null;
  maxRuntimeSeconds: number | null;
  status: "healthy" | "late" | "down" | "paused";
  tags: string[];
  lastPingAt: string | null;
  nextExpectedAt: string | null;
  consecutiveFailures: number;
  isPaused: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Incident {
  id: string;
  monitorId: string;
  status: "open" | "acknowledged" | "resolved";
  reason: string | null;
  missedPingsCount: number;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  startedAt: string;
  resolvedAt: string | null;
  downtimeSeconds: number | null;
}

export interface DashboardStats {
  monitors: {
    total: number;
    healthy: number;
    down: number;
    late: number;
    paused: number;
  };
  openIncidents: number;
}

export interface Job {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  schedule: string;
  timezone: string | null;
  status: "active" | "paused" | "disabled";
  maxRetries: number | null;
  retryDelaySeconds: number | null;
  retryBackoffMultiplier: number | null;
  retryMaxDelaySeconds: number | null;
  concurrencyLimit: number | null;
  concurrencyPolicy: string | null;
  monitorId: string | null;
  teamId: string | null;
  tags: string[];
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobRun {
  id: string;
  jobId: string;
  status: "scheduled" | "running" | "success" | "failed" | "timeout" | "cancelled";
  trigger: "cron" | "manual" | "retry";
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  httpStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  attempt: number;
  queuedAt: string | null;
  parentRunId: string | null;
  createdAt: string;
}

export interface JobRunLog {
  id: string;
  runId: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

export interface JobStats {
  jobId: string;
  period: string;
  runs: {
    total: number;
    successes: number;
    failures: number;
    timeouts: number;
    retries: number;
    successRate: number;
  };
  avgDurationMs: number | null;
  status: string;
}

// ── Legacy step type (kept for backward compat) ─────────────
export interface WorkflowStepDefinition {
  id: string;
  name: string;
  type: "run" | "sleep" | "spawn" | "signal_parent" | "signal_child" | "wait_for_signal" | "fan_out" | "condition" | "loop";
  config: Record<string, unknown>;
  retryPolicy?: { maxAttempts: number; delaySeconds: number; backoffMultiplier: number };
  onFailure?: "abort" | "continue" | "goto";
  onFailureGoto?: string;
}

// ── Graph workflow model ─────────────────────────────────────
export type NodeType = "run" | "sleep" | "condition" | "run_job" | "fan_out" | "webhook_wait";

export interface WorkflowNodeDefinition {
  id: string;
  name: string;
  type: NodeType;
  config: Record<string, unknown>;
  retryPolicy?: { maxAttempts: number; delaySeconds: number; backoffMultiplier: number };
  onFailure?: "abort" | "continue";
  position?: { x: number; y: number };
}

export interface WorkflowEdgeDefinition {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  label?: string;
  loop?: { maxIterations: number; untilExpression: string };
}

export interface WorkflowGraph {
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
}

export interface Workflow {
  id: string;
  jobId: string;
  version: number;
  steps: WorkflowGraph | WorkflowStepDefinition[];
  createdAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  jobRunId: string;
  status: "running" | "sleeping" | "waiting" | "completed" | "failed" | "cancelled";
  currentStepIndex: number | null;
  currentStepId: string | null;
  context: Record<string, unknown>;
  resumeAt: string | null;
  waitTimeoutAt: string | null;
  waitingForChildRunId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  steps: WorkflowGraph | WorkflowStepDefinition[];
  stepResults: WorkflowStepResult[];
}

export interface WorkflowSignal {
  id: string;
  targetRunId: string;
  sourceRunId: string | null;
  sourceStepId: string | null;
  payload: Record<string, unknown>;
  delivered: boolean;
  deliveredAt: string | null;
  createdAt: string;
}

export interface WorkflowStepResult {
  id: string;
  workflowRunId: string;
  stepId: string;
  stepIndex: number;
  status: "completed" | "failed" | "skipped";
  output: unknown;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Ping {
  id: string;
  monitorId: string;
  type: "start" | "success" | "fail" | "log";
  body: string | null;
  durationMs: number | null;
  userAgent: string | null;
  sourceIp: string | null;
  createdAt: string;
}

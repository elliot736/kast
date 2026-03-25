export interface PingEvent {
  monitorId: string;
  pingUuid: string;
  type: 'start' | 'success' | 'fail' | 'log';
  body?: string;
  userAgent?: string;
  sourceIp?: string;
  timestamp: string;
}

export interface MonitorStateEvent {
  monitorId: string;
  status: 'healthy' | 'late' | 'down' | 'paused';
  lastPingAt: string | null;
  nextExpectedAt: string | null;
  consecutiveFailures: number;
  timestamp: string;
}

export interface MonitorEvaluation {
  monitorId: string;
  result: 'healthy' | 'late' | 'missed' | 'failed';
  reason: string;
  expectedAt: string | null;
  actualAt: string | null;
  timestamp: string;
}

export interface IncidentEvent {
  incidentId: string;
  monitorId: string;
  action: 'opened' | 'acknowledged' | 'resolved';
  reason: string;
  timestamp: string;
}

export interface AlertTrigger {
  incidentId: string;
  monitorId: string;
  monitorName: string;
  reason: string;
  timestamp: string;
}

export interface JobTriggerEvent {
  jobId: string;
  runId: string;
  trigger: 'cron' | 'manual' | 'retry';
  scheduledAt: string;
  timestamp: string;
}

export interface JobResultEvent {
  jobId: string;
  runId: string;
  status: 'success' | 'failed' | 'timeout';
  httpStatus?: number;
  durationMs: number;
  errorMessage?: string;
  timestamp: string;
}

export interface JobRetryEvent {
  jobId: string;
  originalRunId: string;
  newRunId: string;
  attempt: number;
  delayMs: number;
  scheduledAt: string;
  timestamp: string;
}

export interface JobRunLogEvent {
  runId: string;
  jobId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface WorkflowResumeEvent {
  workflowRunId: string;
  reason: 'initial' | 'sleep_expired' | 'signal_received' | 'child_completed' | 'retry';
  signalPayload?: unknown;
  timestamp: string;
}

export interface WorkflowSignalEvent {
  targetRunId: string;
  sourceRunId?: string;
  sourceStepId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface WorkflowStepResultEvent {
  workflowRunId: string;
  jobId: string;
  stepId: string;
  stepIndex: number;
  status: 'completed' | 'failed' | 'skipped';
  durationMs?: number;
  timestamp: string;
}

"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface JobRunEvent {
  jobId: string;
  runId: string;
  status: "success" | "failed" | "timeout";
  httpStatus?: number;
  durationMs: number;
  errorMessage?: string;
  timestamp: string;
}

export interface JobLogEvent {
  runId: string;
  jobId: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface WorkflowStepEvent {
  workflowRunId: string;
  jobId: string;
  stepId: string;
  stepIndex: number;
  status: "completed" | "failed" | "skipped";
  durationMs?: number;
  timestamp: string;
}

/**
 * Subscribe to real-time job run, log, and workflow step events via WebSocket.
 * Filters events by jobId so only relevant updates are delivered.
 */
export function useJobEvents(
  jobId: string | null,
  {
    onRunUpdate,
    onLog,
    onWorkflowStep,
  }: {
    onRunUpdate?: (event: JobRunEvent) => void;
    onLog?: (event: JobLogEvent) => void;
    onWorkflowStep?: (event: WorkflowStepEvent) => void;
  },
) {
  const socketRef = useRef<Socket | null>(null);
  const onRunUpdateRef = useRef(onRunUpdate);
  const onLogRef = useRef(onLog);
  const onWorkflowStepRef = useRef(onWorkflowStep);

  onRunUpdateRef.current = onRunUpdate;
  onLogRef.current = onLog;
  onWorkflowStepRef.current = onWorkflowStep;

  useEffect(() => {
    if (!jobId) return;

    const socket = io(`${API_BASE}/events`, {
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("job-run", (data: JobRunEvent) => {
      if (data.jobId === jobId) {
        onRunUpdateRef.current?.(data);
      }
    });

    socket.on("job-log", (data: JobLogEvent) => {
      if (data.jobId === jobId) {
        onLogRef.current?.(data);
      }
    });

    socket.on("workflow-step", (data: WorkflowStepEvent) => {
      if (data.jobId === jobId) {
        onWorkflowStepRef.current?.(data);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [jobId]);
}

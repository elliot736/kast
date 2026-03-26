"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useJobEvents, type JobRunEvent, type JobLogEvent } from "@/hooks/use-job-events";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api, type Job, type JobRun, type JobRunLog, type WorkflowRun } from "@/lib/api";
import { RunStatusBadge } from "@/components/jobs/run-status-badge";
import { LogViewer } from "@/components/jobs/log-viewer";
import { RetryChain } from "@/components/jobs/retry-chain";
import { ExecutionCanvas } from "@/components/workflows/canvas/execution-canvas";
import { StepTimeline } from "@/components/workflows/step-timeline";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
  Clock,
  Timer,
  Globe,
  Hash,
  XCircle,
} from "lucide-react";

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const runId = params.runId as string;

  const [job, setJob] = useState<Job | null>(null);
  const [run, setRun] = useState<JobRun | null>(null);
  const [logs, setLogs] = useState<JobRunLog[]>([]);
  const [retryChain, setRetryChain] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<string | null>(null);
  const [wfRun, setWfRun] = useState<WorkflowRun | null>(null);

  useEffect(() => {
    Promise.all([
      api<Job>(`/api/v1/jobs/${jobId}`),
      api<JobRun>(`/api/v1/jobs/${jobId}/runs/${runId}`),
      api<JobRunLog[]>(`/api/v1/jobs/${jobId}/runs/${runId}/logs`),
      api<JobRun[]>(`/api/v1/jobs/${jobId}/runs`),
    ])
      .then(([jobData, runData, logsData, allRuns]) => {
        setJob(jobData);
        setRun(runData);
        setLogs(logsData);

        // Build retry chain: find all runs linked by parentRunId
        const chain: JobRun[] = [];
        let current: JobRun | undefined = runData;

        // Walk back to the root
        while (current?.parentRunId) {
          const parent = allRuns.find((r) => r.id === current!.parentRunId);
          if (parent) chain.unshift(parent);
          current = parent;
        }

        // Now walk forward from root
        const root = chain.length > 0 ? chain[0] : runData;
        const ordered: JobRun[] = [root];
        let next = allRuns.find((r) => r.parentRunId === root.id);
        while (next) {
          ordered.push(next);
          next = allRuns.find((r) => r.parentRunId === next!.id);
        }

        // Only show chain if more than 1 run
        if (ordered.length > 1) {
          setRetryChain(ordered);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [jobId, runId]);

  // Fetch workflow run data (if this run has a workflow)
  useEffect(() => {
    api<WorkflowRun>(`/api/v1/jobs/${jobId}/runs/${runId}/workflow`)
      .then(setWfRun)
      .catch(() => setWfRun(null));
  }, [jobId, runId]);

  // Poll workflow run while active
  useEffect(() => {
    if (!wfRun) return;
    if (!["running", "sleeping", "waiting"].includes(wfRun.status)) return;
    const interval = setInterval(() => {
      api<WorkflowRun>(`/api/v1/jobs/${jobId}/runs/${runId}/workflow`)
        .then(setWfRun)
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId, runId, wfRun?.status]);

  // Real-time updates via WebSocket
  useJobEvents(jobId, {
    onRunUpdate: useCallback((event: JobRunEvent) => {
      if (event.runId === runId) {
        setRun((prev) =>
          prev
            ? { ...prev, status: event.status as JobRun["status"], durationMs: event.durationMs, httpStatus: event.httpStatus ?? prev.httpStatus, errorMessage: event.errorMessage ?? prev.errorMessage }
            : prev,
        );
      }
    }, [runId]),
    onLog: useCallback((event: JobLogEvent) => {
      if (event.runId === runId) {
        setLogs((prev) => [
          ...prev,
          {
            id: `ws-${Date.now()}-${Math.random()}`,
            runId: event.runId,
            level: event.level,
            message: event.message,
            metadata: event.metadata ?? null,
            timestamp: event.timestamp,
          },
        ]);
      }
    }, [runId]),
  });

  const handleCancel = async () => {
    try {
      const updated = await api<JobRun>(
        `/api/v1/jobs/${jobId}/runs/${runId}/cancel`,
        { method: "POST" },
      );
      setRun(updated);
      toast.success("Run cancelled");
    } catch (err) {
      toast.error("Failed to cancel run", {
        description: (err as Error).message,
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    );
  }

  if (error || !job || !run) {
    return <ErrorBanner message={error ?? "Run not found"} />;
  }

  const canCancel = run.status === "scheduled" || run.status === "running";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Jobs", href: "/jobs" },
          { label: job.name, href: `/jobs/${jobId}` },
          { label: `Run #${run.attempt}` },
        ]}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Run #{run.attempt}
            </h1>
            <RunStatusBadge status={run.status} />
            <Badge variant="outline" className="text-xs">
              {run.trigger}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">{run.id}</p>
        </div>
        {canCancel && (
          <Button size="sm" variant="destructive" onClick={handleCancel}>
            <XCircle className="size-3.5" />
            Cancel Run
          </Button>
        )}
      </div>

      {/* Retry Chain */}
      {retryChain.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Retry Chain</CardTitle>
          </CardHeader>
          <CardContent>
            <RetryChain runs={retryChain} currentRunId={runId} jobId={jobId} />
          </CardContent>
        </Card>
      )}

      {/* Timeline Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="size-3" />
              Scheduled
            </div>
            <p className="text-sm tabular-nums">
              {new Date(run.scheduledAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="size-3" />
              Started
            </div>
            <p className="text-sm tabular-nums">
              {run.startedAt ? new Date(run.startedAt).toLocaleString() : "\u2014"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="size-3" />
              Finished
            </div>
            <p className="text-sm tabular-nums">
              {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "\u2014"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Timer className="size-3" />
              Duration
            </div>
            <p className="text-2xl font-semibold tabular-nums font-mono">
              {run.durationMs != null ? `${run.durationMs}ms` : "\u2014"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* HTTP Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">HTTP Response</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Globe className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Status:</span>
              <span className="font-mono">
                {run.httpStatus ?? "\u2014"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Hash className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Attempt:</span>
              <span>{run.attempt}</span>
            </div>
          </div>
          {run.errorMessage && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Error</p>
                <pre className="rounded-md bg-critical/5 border border-critical/20 p-3 text-xs text-critical overflow-x-auto whitespace-pre-wrap">
                  {run.errorMessage}
                </pre>
              </div>
            </>
          )}
          {run.responseBody && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Response Body</p>
                <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs overflow-x-auto max-h-[200px] whitespace-pre-wrap">
                  {run.responseBody}
                </pre>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Workflow Execution */}
      {wfRun && (
        <Tabs defaultValue="canvas">
          <TabsList>
            <TabsTrigger value="canvas">Workflow Canvas</TabsTrigger>
            <TabsTrigger value="timeline">Step Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="canvas" className="mt-3">
            <ExecutionCanvas
              graph={
                wfRun.steps && "nodes" in wfRun.steps
                  ? wfRun.steps
                  : { nodes: [], edges: [] }
              }
              stepResults={wfRun.stepResults}
              currentStepId={(wfRun as any).currentStepId ?? null}
              workflowStatus={wfRun.status}
            />
          </TabsContent>

          <TabsContent value="timeline" className="mt-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Steps</CardTitle>
              </CardHeader>
              <CardContent>
                <StepTimeline
                  steps={
                    wfRun.steps && "nodes" in wfRun.steps
                      ? (wfRun.steps.nodes as any[])
                      : (wfRun.steps as any[])
                  }
                  stepResults={wfRun.stepResults}
                  currentStepIndex={wfRun.currentStepIndex}
                  workflowStatus={wfRun.status}
                  resumeAt={wfRun.resumeAt}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Logs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Execution Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <LogViewer
            logs={logs}
            filterLevel={logFilter}
            onFilterChange={setLogFilter}
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}

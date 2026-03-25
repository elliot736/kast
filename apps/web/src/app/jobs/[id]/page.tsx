"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useJobEvents, type JobRunEvent, type WorkflowStepEvent } from "@/hooks/use-job-events";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { api, type Job, type JobRun, type JobStats, type Workflow, type WorkflowRun, type WorkflowStepDefinition } from "@/lib/api";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { RunStatusBadge } from "@/components/jobs/run-status-badge";
import { ConcurrencyMeter } from "@/components/jobs/concurrency-meter";
import { WorkflowCanvas } from "@/components/workflows/canvas/workflow-canvas";
import { CronBuilder } from "@/components/ui/cron-builder";
import { JobDurationChart } from "@/components/charts/job-duration-chart";
import { JobSuccessChart } from "@/components/charts/job-success-chart";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
  MoreHorizontal,
  Pencil,
  Pause,
  Play,
  Trash2,
  PlayCircle,
  Copy,
  Check,
  Clock,
  Globe,
  Zap,
  Timer,
  Hash,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";

const triggerBadgeColors: Record<string, string> = {
  cron: "bg-primary/10 text-primary border-primary/20",
  manual: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  retry: "bg-warn/10 text-warn border-warn/20",
};

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

interface JobEditForm {
  name: string;
  schedule: string;
  timezone: string;
  url: string;
  method: string;
  timeoutSeconds: string;
  maxRetries: string;
  retryDelaySeconds: string;
  concurrencyLimit: string;
  concurrencyPolicy: string;
  tags: string;
}

function makeRunColumns(jobId: string): ColumnDef<JobRun>[] {
  return [
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Link href={`/jobs/${jobId}/runs/${row.original.id}`}>
          <RunStatusBadge status={row.original.status} />
        </Link>
      ),
    },
    {
      accessorKey: "trigger",
      header: "Trigger",
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={triggerBadgeColors[row.original.trigger] ?? ""}
        >
          {row.original.trigger}
        </Badge>
      ),
    },
    {
      id: "attempt",
      header: "#",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {row.original.attempt}
        </span>
      ),
    },
    {
      accessorKey: "scheduledAt",
      header: "Scheduled",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {new Date(row.original.scheduledAt).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "durationMs",
      header: "Duration",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums font-mono">
          {row.original.durationMs != null
            ? `${row.original.durationMs}ms`
            : "\u2014"}
        </span>
      ),
    },
    {
      accessorKey: "httpStatus",
      header: "HTTP",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums font-mono">
          {row.original.httpStatus ?? "\u2014"}
        </span>
      ),
    },
    {
      accessorKey: "errorMessage",
      header: "Error",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[250px] block">
          {row.original.errorMessage ?? "\u2014"}
        </span>
      ),
    },
  ];
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [activeWfRun, setActiveWfRun] = useState<WorkflowRun | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<JobEditForm>({
    name: "",
    schedule: "",
    timezone: "",
    url: "",
    method: "",
    timeoutSeconds: "",
    maxRetries: "",
    retryDelaySeconds: "",
    concurrencyLimit: "",
    concurrencyPolicy: "",
    tags: "",
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      api<Job>(`/api/v1/jobs/${id}`),
      api<JobRun[]>(`/api/v1/jobs/${id}/runs`),
      api<JobStats>(`/api/v1/jobs/${id}/stats`),
      api<Workflow | null>(`/api/v1/jobs/${id}/workflow`).catch(() => null),
    ])
      .then(([jobData, runsData, statsData, workflowData]) => {
        setJob(jobData);
        setRuns(runsData);
        setStats(statsData);
        setWorkflow(workflowData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Real-time updates via WebSocket
  useJobEvents(id, {
    onRunUpdate: useCallback((event: JobRunEvent) => {
      setRuns((prev) => {
        const exists = prev.find((r) => r.id === event.runId);
        if (exists) {
          // Update existing run status
          return prev.map((r) =>
            r.id === event.runId
              ? { ...r, status: event.status as JobRun["status"], durationMs: event.durationMs, httpStatus: event.httpStatus ?? r.httpStatus, errorMessage: event.errorMessage ?? r.errorMessage }
              : r,
          );
        }
        // New run appeared — re-fetch to get full data
        api<JobRun>(`/api/v1/jobs/${id}/runs/${event.runId}`)
          .then((run) => setRuns((p) => [run, ...p]))
          .catch(() => {});
        return prev;
      });
    }, [id]),
    onWorkflowStep: useCallback((event: WorkflowStepEvent) => {
      setActiveWfRun((prev) => {
        // If no active run yet, or event is for a different run — start fresh
        if (!prev || prev.id !== event.workflowRunId) {
          return {
            id: event.workflowRunId,
            workflowId: "",
            jobRunId: "",
            status: "running" as const,
            currentStepIndex: event.stepIndex + 1,
            context: {},
            resumeAt: null,
            waitTimeoutAt: null,
            waitingForChildRunId: null,
            startedAt: new Date().toISOString(),
            finishedAt: null,
            createdAt: new Date().toISOString(),
            steps: prev?.steps ?? workflow?.steps ?? [],
            stepResults: [{
              id: `ws-${event.stepId}-${event.stepIndex}`,
              workflowRunId: event.workflowRunId,
              stepId: event.stepId,
              stepIndex: event.stepIndex,
              status: event.status as any,
              output: null,
              errorMessage: null,
              durationMs: event.durationMs ?? null,
              startedAt: null,
              finishedAt: event.timestamp,
            }],
          };
        }

        // Same run — update existing
        const exists = prev.stepResults.some((r) => r.stepIndex === event.stepIndex);
        if (exists) {
          return {
            ...prev,
            stepResults: prev.stepResults.map((r) =>
              r.stepIndex === event.stepIndex
                ? { ...r, status: event.status as any, durationMs: event.durationMs ?? r.durationMs }
                : r,
            ),
          };
        }
        return {
          ...prev,
          currentStepIndex: event.stepIndex + 1,
          stepResults: [
            ...prev.stepResults,
            {
              id: `ws-${event.stepId}-${event.stepIndex}`,
              workflowRunId: prev.id,
              stepId: event.stepId,
              stepIndex: event.stepIndex,
              status: event.status as any,
              output: null,
              errorMessage: null,
              durationMs: event.durationMs ?? null,
              startedAt: null,
              finishedAt: event.timestamp,
            },
          ],
        };
      });
    }, [workflow]),
  });

  // Fetch workflow run for the latest run (once, not polling)
  useEffect(() => {
    if (!workflow || runs.length === 0) return;
    const targetRun =
      runs.find((r) => ["running", "sleeping", "waiting"].includes(r.status))
      ?? runs.find((r) => ["success", "failed"].includes(r.status))
      ?? runs[0];
    if (!targetRun) return;

    api<WorkflowRun>(`/api/v1/jobs/${id}/runs/${targetRun.id}/workflow`)
      .then(setActiveWfRun)
      .catch(() => setActiveWfRun(null));
  }, [id, workflow, runs]);

  const handlePauseToggle = async () => {
    if (!job) return;
    const original = job;
    const action = job.status === "paused" ? "resume" : "pause";
    const newStatus = action === "pause" ? "paused" : "active";

    // Optimistic update
    setJob({ ...job, status: newStatus as Job["status"] });

    try {
      const updated = await api<Job>(`/api/v1/jobs/${id}/${action}`, {
        method: "POST",
      });
      setJob(updated);
      toast.success(action === "pause" ? "Job paused" : "Job resumed");
    } catch (err) {
      setJob(original);
      toast.error(`Failed to ${action} job`, {
        description: (err as Error).message,
      });
    }
  };

  const openEditForm = () => {
    if (!job) return;
    setEditForm({
      name: job.name,
      schedule: job.schedule ?? "",
      timezone: job.timezone ?? "",
      url: job.url,
      method: job.method ?? "POST",
      timeoutSeconds: job.timeoutSeconds?.toString() ?? "",
      maxRetries: job.maxRetries?.toString() ?? "",
      retryDelaySeconds: job.retryDelaySeconds?.toString() ?? "",
      concurrencyLimit: job.concurrencyLimit?.toString() ?? "",
      concurrencyPolicy: job.concurrencyPolicy ?? "queue",
      tags: job.tags.join(", "),
    });
    setEditError(null);
    setEditing(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditSaving(true);
    setEditError(null);
    try {
      const body: Record<string, unknown> = {
        name: editForm.name,
        schedule: editForm.schedule,
        url: editForm.url,
        method: editForm.method,
      };
      if (editForm.timezone) body.timezone = editForm.timezone;
      if (editForm.timeoutSeconds)
        body.timeoutSeconds = Number(editForm.timeoutSeconds);
      if (editForm.maxRetries)
        body.maxRetries = Number(editForm.maxRetries);
      if (editForm.retryDelaySeconds)
        body.retryDelaySeconds = Number(editForm.retryDelaySeconds);
      if (editForm.concurrencyLimit)
        body.concurrencyLimit = Number(editForm.concurrencyLimit);
      if (editForm.concurrencyPolicy)
        body.concurrencyPolicy = editForm.concurrencyPolicy;
      body.tags = editForm.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const updated = await api<Job>(`/api/v1/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setJob(updated);
      setEditing(false);
      toast.success("Job updated");
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleCopyEndpoint = () => {
    if (!job) return;
    navigator.clipboard.writeText(job.url);
    setCopied(true);
    toast.success("Endpoint URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTrigger = async () => {
    if (!job) return;
    try {
      const run = await api<JobRun>(`/api/v1/jobs/${id}/trigger`, {
        method: "POST",
      });
      setRuns((prev) => [run, ...prev]);
      // Reset active workflow run so it picks up the new one
      setActiveWfRun(null);
      toast.success("Job triggered");
    } catch (err) {
      toast.error("Failed to trigger job", {
        description: (err as Error).message,
      });
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/api/v1/jobs/${id}`, { method: "DELETE" });
      toast.success("Job deleted");
      router.push("/jobs");
    } catch (err) {
      toast.error("Failed to delete job", {
        description: (err as Error).message,
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    );
  }

  if (error || !job) {
    return <ErrorBanner message={error ?? "Job not found"} />;
  }

  const runningCount = runs.filter((r) => r.status === "running").length;

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
          { label: job.name },
        ]}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {job.name}
            </h1>
            <JobStatusBadge status={job.status} />
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {job.description && (
              <>
                <span>{job.description}</span>
                <Separator orientation="vertical" className="h-4" />
              </>
            )}
            <span className="font-mono text-xs bg-surface px-2 py-0.5 rounded border border-border">
              {job.schedule}
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-xs">{job.slug}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleTrigger}>
            <PlayCircle className="size-3.5" />
            Trigger Now
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openEditForm}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePauseToggle}>
                {job.status === "paused" ? (
                  <>
                    <Play className="size-4" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="size-4" />
                    Pause
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Edit Form */}
      {editing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Edit Job</CardTitle>
              <CardDescription>Update job configuration</CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              {editError && (
                <div className="flex items-center gap-3 rounded-lg border border-critical/30 bg-critical/5 px-4 py-3 mb-4">
                  <AlertTriangle className="size-4 text-critical shrink-0" />
                  <p className="text-sm text-critical">{editError}</p>
                </div>
              )}
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Name</Label>
                    <Input
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Schedule (cron)</Label>
                    <CronBuilder
                      value={editForm.schedule}
                      onChange={(cron) => setEditForm((f) => ({ ...f, schedule: cron }))}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Endpoint URL</Label>
                    <Input
                      value={editForm.url}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, url: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Method</Label>
                      <Input
                        value={editForm.method}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, method: e.target.value }))
                        }
                        placeholder="POST"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Timezone</Label>
                      <Input
                        value={editForm.timezone}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, timezone: e.target.value }))
                        }
                        placeholder="UTC"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Timeout (seconds)</Label>
                    <Input
                      type="number"
                      value={editForm.timeoutSeconds}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, timeoutSeconds: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Max Retries</Label>
                    <Input
                      type="number"
                      value={editForm.maxRetries}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, maxRetries: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Retry Delay (seconds)</Label>
                    <Input
                      type="number"
                      value={editForm.retryDelaySeconds}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, retryDelaySeconds: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Concurrency Limit</Label>
                    <Input
                      type="number"
                      value={editForm.concurrencyLimit}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, concurrencyLimit: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Concurrency Policy</Label>
                    <Input
                      value={editForm.concurrencyPolicy}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, concurrencyPolicy: e.target.value }))
                      }
                      placeholder="queue"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Tags (comma-separated)</Label>
                    <Input
                      value={editForm.tags}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, tags: e.target.value }))
                      }
                      placeholder="backend, critical"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" type="submit" disabled={editSaving}>
                    {editSaving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Endpoint URL */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Endpoint URL</CardTitle>
          <CardDescription>The URL that gets called on each job run</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-background border border-border rounded-lg px-4 py-2.5 overflow-x-auto text-muted-foreground">
              {job.method ?? "POST"} {job.url}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyEndpoint}
              className="shrink-0"
            >
              {copied ? (
                <Check className="size-3.5 text-alive" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <motion.div variants={fadeUp}>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Runs (30d)</p>
                  <p className="text-2xl font-semibold tabular-nums mt-1">
                    {stats?.runs.total ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {stats?.runs.successes ?? 0} success / {stats?.runs.failures ?? 0} fail
                  </p>
                </div>
                <div className="size-9 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center">
                  <Hash className="size-4 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Success Rate</p>
                  <p className={`text-2xl font-semibold tabular-nums mt-1 ${
                    (stats?.runs.successRate ?? 0) > 95
                      ? "text-alive"
                      : (stats?.runs.successRate ?? 0) > 80
                        ? "text-warn"
                        : "text-critical"
                  }`}>
                    {stats ? `${stats.runs.successRate}%` : "\u2014"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Last 30 days
                  </p>
                </div>
                <div className={`size-9 rounded-lg flex items-center justify-center ${
                  (stats?.runs.successRate ?? 0) > 95
                    ? "bg-alive/10 border border-alive/20"
                    : (stats?.runs.successRate ?? 0) > 80
                      ? "bg-warn/10 border border-warn/20"
                      : "bg-critical/10 border border-critical/20"
                }`}>
                  <TrendingUp className={`size-4 ${
                    (stats?.runs.successRate ?? 0) > 95
                      ? "text-alive"
                      : (stats?.runs.successRate ?? 0) > 80
                        ? "text-warn"
                        : "text-critical"
                  }`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Avg Duration</p>
                  <p className="text-2xl font-semibold tabular-nums font-mono mt-1">
                    {stats?.avgDurationMs != null ? `${stats.avgDurationMs}ms` : "\u2014"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Across successful runs
                  </p>
                </div>
                <div className="size-9 rounded-lg bg-blue-500/5 border border-blue-500/10 flex items-center justify-center">
                  <Timer className="size-4 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Card className={(stats?.runs.failures ?? 0) > 0 ? "ring-1 ring-critical/30 glow-critical" : ""}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Failures / Retries</p>
                  <p className={`text-2xl font-semibold tabular-nums mt-1 ${(stats?.runs.failures ?? 0) > 0 ? "text-critical" : ""}`}>
                    {stats?.runs.failures ?? 0} / {stats?.runs.retries ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Last 30 days
                  </p>
                </div>
                <div className={`size-9 rounded-lg flex items-center justify-center ${
                  (stats?.runs.failures ?? 0) > 0
                    ? "bg-critical/10 border border-critical/20"
                    : "bg-muted border border-border"
                }`}>
                  <AlertTriangle className={`size-4 ${(stats?.runs.failures ?? 0) > 0 ? "text-critical" : "text-muted-foreground"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Job Config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-y-3 gap-x-8 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Schedule:</span>
              <span className="font-mono">{job.schedule}</span>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Timezone:</span>
              <span>{job.timezone ?? "UTC"}</span>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <Zap className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Endpoint:</span>
              <span className="font-mono text-xs">
                {job.method ?? "POST"} {job.url}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Timer className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Timeout:</span>
              <span>{job.timeoutSeconds ?? 30}s</span>
            </div>
            {job.tags.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Tags:</span>
                <div className="flex gap-1">
                  {job.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Retry & Concurrency Config */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Retry Policy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Max Retries:</span>{" "}
                <span className="font-mono">{job.maxRetries ?? 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Delay:</span>{" "}
                <span className="font-mono">{job.retryDelaySeconds ?? 60}s</span>
              </div>
              <div>
                <span className="text-muted-foreground">Backoff:</span>{" "}
                <span className="font-mono">{job.retryBackoffMultiplier ?? 2}x</span>
              </div>
              <div>
                <span className="text-muted-foreground">Max Delay:</span>{" "}
                <span className="font-mono">{job.retryMaxDelaySeconds ?? 3600}s</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Concurrency</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ConcurrencyMeter
              running={runningCount}
              limit={job.concurrencyLimit ?? 1}
              policy={job.concurrencyPolicy ?? "queue"}
            />
            {job.successStatusCodes && (
              <div className="text-sm">
                <span className="text-muted-foreground">Success codes:</span>{" "}
                <span className="font-mono text-xs">
                  {job.successStatusCodes.join(", ")}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Duration Trend</CardTitle>
            <CardDescription>Run duration over time</CardDescription>
          </CardHeader>
          <CardContent>
            <JobDurationChart runs={runs} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Success Rate</CardTitle>
            <CardDescription>Daily success rate (last 30 days)</CardDescription>
          </CardHeader>
          <CardContent>
            <JobSuccessChart runs={runs} />
          </CardContent>
        </Card>
      </div>

      {/* Workflow Builder */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Workflow
              {workflow && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  v{workflow.version}
                </Badge>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <WorkflowCanvas
            steps={workflow?.steps ?? []}
            saving={savingWorkflow}
            execution={activeWfRun ? {
              stepResults: activeWfRun.stepResults,
              currentStepIndex: activeWfRun.currentStepIndex,
              workflowStatus: activeWfRun.status,
            } : undefined}
            onSave={async (steps) => {
              setSavingWorkflow(true);
              try {
                const updated = await api<Workflow>(`/api/v1/jobs/${id}/workflow`, {
                  method: "PUT",
                  body: JSON.stringify({ steps }),
                });
                setWorkflow(updated);
                toast.success(`Workflow saved (v${updated.version})`);
              } catch (err) {
                toast.error("Failed to save workflow", {
                  description: (err as Error).message,
                });
              } finally {
                setSavingWorkflow(false);
              }
            }}
          />
        </CardContent>
      </Card>

      {/* Runs Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={makeRunColumns(id)}
            data={runs}
            pageSize={20}
            emptyState={
              <div className="py-12 text-center text-sm text-muted-foreground">
                No runs yet. Trigger a run or wait for the schedule.
              </div>
            }
          />
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Job</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{job.name}</span>{" "}
              and all associated run history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

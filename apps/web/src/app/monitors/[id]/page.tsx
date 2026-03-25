"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
import { Progress } from "@/components/ui/progress";
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
import { api, type Monitor, type Ping } from "@/lib/api";
import { StatusBadge } from "@/components/monitors/status-badge";
import { PingBodyViewer } from "@/components/monitors/ping-body-viewer";
import { CronBuilder } from "@/components/ui/cron-builder";
import { HealthTrend } from "@/components/monitors/health-trend";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ErrorBanner } from "@/components/ui/error-banner";
import { DurationChart } from "@/components/charts/duration-chart";
import { UptimeChart } from "@/components/charts/uptime-chart";
import {
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Pause,
  Play,
  Trash2,
  Copy,
  Check,
  TrendingUp,
  Activity,
  Clock,
  AlertTriangle,
  Zap,
} from "lucide-react";

const pingTypeColors: Record<string, string> = {
  success: "bg-alive",
  fail: "bg-critical",
  start: "bg-blue-400",
  log: "bg-neutral",
};

const pingTypeBadgeColors: Record<string, string> = {
  success: "bg-alive/10 text-alive border-alive/20",
  fail: "bg-critical/10 text-critical border-critical/20",
  start: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  log: "bg-neutral/10 text-neutral border-neutral/20",
};

interface MonitorStats {
  pings: { total: number; successes: number; failures: number; uptimePercent: number };
  avgRuntimeMs: number | null;
  incidents: { total: number; open: number };
  status: string;
  consecutiveFailures: number;
}

interface EditForm {
  name: string;
  schedule: string;
  intervalSeconds: string;
  graceSeconds: string;
  maxRuntimeSeconds: string;
  tags: string;
}

const pingColumns: ColumnDef<Ping>[] = [
  {
    id: "dot",
    size: 32,
    enableSorting: false,
    cell: ({ row }) => (
      <span
        className={`inline-block size-2 rounded-full ${pingTypeColors[row.original.type] ?? "bg-neutral"}`}
      />
    ),
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={`text-[10px] font-mono ${pingTypeBadgeColors[row.original.type] ?? "bg-neutral/10 text-neutral border-neutral/20"}`}
      >
        {row.original.type}
      </Badge>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Timestamp",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground tabular-nums">
        {new Date(row.original.createdAt).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "durationMs",
    header: "Duration",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground tabular-nums font-mono">
        {row.original.durationMs !== null ? `${row.original.durationMs}ms` : "\u2014"}
      </span>
    ),
  },
  {
    accessorKey: "sourceIp",
    header: "Source IP",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground font-mono">
        {row.original.sourceIp ?? "\u2014"}
      </span>
    ),
  },
  {
    id: "body",
    size: 40,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.body ? <PingBodyViewer body={row.original.body} /> : null,
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

export default function MonitorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [pings, setPings] = useState<Ping[]>([]);
  const [stats, setStats] = useState<MonitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    schedule: "",
    intervalSeconds: "",
    graceSeconds: "",
    maxRuntimeSeconds: "",
    tags: "",
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchMonitor = useCallback(() => {
    return Promise.all([
      api<Monitor>(`/api/v1/monitors/${id}`),
      api<Ping[]>(`/api/v1/monitors/${id}/pings`),
      api<MonitorStats>(`/api/v1/monitors/${id}/stats`),
    ])
      .then(([m, p, s]) => {
        setMonitor(m);
        setPings(p);
        setStats(s);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchMonitor();
  }, [fetchMonitor]);

  const openEditForm = () => {
    if (!monitor) return;
    setEditForm({
      name: monitor.name,
      schedule: monitor.schedule ?? "",
      intervalSeconds: monitor.intervalSeconds?.toString() ?? "",
      graceSeconds: monitor.graceSeconds?.toString() ?? "",
      maxRuntimeSeconds: monitor.maxRuntimeSeconds?.toString() ?? "",
      tags: monitor.tags.join(", "),
    });
    setEditError(null);
    setEditing(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditSaving(true);
    setEditError(null);
    try {
      const body: Record<string, unknown> = { name: editForm.name };
      if (editForm.schedule) body.schedule = editForm.schedule;
      if (editForm.intervalSeconds)
        body.intervalSeconds = Number(editForm.intervalSeconds);
      if (editForm.graceSeconds)
        body.graceSeconds = Number(editForm.graceSeconds);
      if (editForm.maxRuntimeSeconds)
        body.maxRuntimeSeconds = Number(editForm.maxRuntimeSeconds);
      body.tags = editForm.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const updated = await api<Monitor>(`/api/v1/monitors/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setMonitor(updated);
      setEditing(false);
      toast.success("Monitor updated");
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!monitor) return;
    setDeleting(true);
    try {
      await api(`/api/v1/monitors/${id}`, { method: "DELETE" });
      toast.success(`Deleted "${monitor.name}"`);
      router.push("/monitors");
    } catch (err) {
      toast.error("Failed to delete monitor", {
        description: (err as Error).message,
      });
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handlePauseToggle = async () => {
    if (!monitor) return;
    const original = monitor;
    const newIsPaused = !monitor.isPaused;

    // Optimistic update
    setMonitor({ ...monitor, isPaused: newIsPaused, status: newIsPaused ? "paused" : "healthy" });

    try {
      const updated = await api<Monitor>(`/api/v1/monitors/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPaused: newIsPaused }),
      });
      setMonitor(updated);
      toast.success(updated.isPaused ? `Paused "${monitor.name}"` : `Resumed "${monitor.name}"`);
    } catch (err) {
      setMonitor(original);
      toast.error("Failed to update monitor", {
        description: (err as Error).message,
      });
    }
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  const handleCopyPingUrl = () => {
    if (!monitor) return;
    const url = `${apiUrl}/ping/${monitor.pingUuid}/success`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Ping URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Skeleton className="h-4 w-16" />
          <ChevronRight className="size-3" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-8 w-8" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-16 rounded-lg" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <Skeleton className="h-[300px] rounded-lg" />
      </div>
    );
  }

  if (error && !monitor) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-critical/30 bg-critical/5 px-4 py-12 justify-center">
        <AlertTriangle className="size-8 text-critical opacity-60" />
        <div className="text-center">
          <p className="text-sm font-medium text-critical">Failed to load monitor</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setError(null); setLoading(true); fetchMonitor(); }}>
          Try again
        </Button>
      </div>
    );
  }

  if (!monitor) return null;

  const uptimePercent = stats?.pings.uptimePercent ?? 100;
  const openIncidents = stats?.incidents.open ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Breadcrumb */}
      <Breadcrumbs items={[
        { label: "Monitors", href: "/monitors" },
        { label: monitor.name },
      ]} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{monitor.name}</h1>
            <StatusBadge status={monitor.status} />
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {monitor.description && (
              <>
                <span>{monitor.description}</span>
                <Separator orientation="vertical" className="h-4" />
              </>
            )}
            <span className="font-mono text-xs bg-surface px-2 py-0.5 rounded border border-border">
              {monitor.schedule ??
                (monitor.intervalSeconds
                  ? `Every ${monitor.intervalSeconds}s`
                  : "No schedule")}
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-xs">{monitor.slug}</span>
          </div>
        </div>

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
              {monitor.isPaused ? (
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
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Error Banner */}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Edit Form */}
      {editing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Edit Monitor</CardTitle>
              <CardDescription>Update monitor configuration</CardDescription>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Interval (seconds)</Label>
                    <Input
                      type="number"
                      value={editForm.intervalSeconds}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, intervalSeconds: e.target.value }))
                      }
                      placeholder="Alternative to cron"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Schedule (cron)</Label>
                  <CronBuilder
                    value={editForm.schedule}
                    onChange={(cron) => setEditForm((f) => ({ ...f, schedule: cron }))}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Grace (seconds)</Label>
                    <Input
                      type="number"
                      value={editForm.graceSeconds}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, graceSeconds: e.target.value }))
                      }
                    />
                  </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Max Runtime (seconds)</Label>
                  <Input
                    type="number"
                    value={editForm.maxRuntimeSeconds}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        maxRuntimeSeconds: e.target.value,
                      }))
                    }
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

      {/* Stat Cards */}
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
                  <p className="text-xs text-muted-foreground">Uptime (30d)</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <p className={`text-2xl font-semibold tabular-nums ${uptimePercent >= 99 ? "text-alive" : uptimePercent >= 95 ? "text-warn" : "text-critical"}`}>
                      {uptimePercent}%
                    </p>
                    <HealthTrend pings={pings} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Last 30 days
                  </p>
                </div>
                <div className="size-9 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center">
                  <TrendingUp className="size-4 text-primary" />
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
                  <p className="text-xs text-muted-foreground">Total Pings</p>
                  <p className="text-2xl font-semibold tabular-nums mt-1">
                    {stats?.pings.total ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {stats?.pings.successes ?? 0} success / {stats?.pings.failures ?? 0} fail
                  </p>
                </div>
                <div className="size-9 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center">
                  <Activity className="size-4 text-primary" />
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
                  <p className="text-xs text-muted-foreground">Avg Runtime</p>
                  <p className="text-2xl font-semibold tabular-nums mt-1">
                    {stats?.avgRuntimeMs ? `${stats.avgRuntimeMs}ms` : "\u2014"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Across successful pings
                  </p>
                </div>
                <div className="size-9 rounded-lg bg-blue-500/5 border border-blue-500/10 flex items-center justify-center">
                  <Zap className="size-4 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Card className={openIncidents > 0 ? "ring-1 ring-critical/30 glow-critical" : ""}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Open Incidents</p>
                  <p className={`text-2xl font-semibold tabular-nums mt-1 ${openIncidents > 0 ? "text-critical" : ""}`}>
                    {openIncidents}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {stats?.incidents.total ?? 0} total incidents
                  </p>
                </div>
                <div className={`size-9 rounded-lg flex items-center justify-center ${
                  openIncidents > 0
                    ? "bg-critical/10 border border-critical/20"
                    : "bg-muted border border-border"
                }`}>
                  <AlertTriangle className={`size-4 ${openIncidents > 0 ? "text-critical" : "text-muted-foreground"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Ping URL */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ping URL</CardTitle>
          <CardDescription>Send pings to this endpoint to report job status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-background border border-border rounded-lg px-4 py-2.5 overflow-x-auto text-muted-foreground">
              {apiUrl}/ping/{monitor.pingUuid}/success
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyPingUrl}
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

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Runtime Duration</CardTitle>
            <CardDescription>Duration of successful pings over time</CardDescription>
          </CardHeader>
          <CardContent>
            <DurationChart pings={pings} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Uptime</CardTitle>
            <CardDescription>Daily success rate (last 30 days)</CardDescription>
          </CardHeader>
          <CardContent>
            <UptimeChart pings={pings} />
          </CardContent>
        </Card>
      </div>

      {/* Ping Timeline - Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Ping Timeline</CardTitle>
          <CardDescription>
            Recent ping history ({pings.length} pings)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Clock className="size-6 text-muted-foreground mb-3 opacity-30" />
              <p className="text-sm text-muted-foreground">
                No pings received yet
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Send a ping to see activity here
              </p>
            </div>
          ) : (
            <DataTable
              columns={pingColumns}
              data={pings}
              searchKey="type"
              searchPlaceholder="Filter by type..."
              pageSize={15}
            />
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Monitor</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{monitor.name}</span>{" "}
              and all associated ping history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Monitor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

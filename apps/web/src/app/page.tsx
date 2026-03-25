"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type DashboardStats, type Monitor, type Incident, type Job, type JobRun, type JobStats } from "@/lib/api";
import { RunStatusBadge } from "@/components/jobs/run-status-badge";
import { timeAgo, formatDuration } from "@/lib/utils";
import { StatusBadge } from "@/components/monitors/status-badge";
import { MiniUptimeBar } from "@/components/monitors/mini-uptime-bar";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { MiniSuccessBar } from "@/components/jobs/mini-success-bar";
import { Onboarding } from "@/components/onboarding";
import { RelativeTime } from "@/components/ui/relative-time";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useRelativeTime } from "@/hooks/use-relative-time";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Clock,
  ArrowRight,
  RefreshCw,
  Pause,
  Play,
  Zap,
} from "lucide-react";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

function StatCard({
  label,
  value,
  valueClass,
  sub,
  icon,
  iconClass,
  cardClass,
}: {
  label: string;
  value: number;
  valueClass?: string;
  sub: string;
  icon: React.ReactNode;
  iconClass: string;
  cardClass?: string;
}) {
  return (
    <motion.div variants={fadeUp}>
      <Card className={cardClass}>
        <CardContent>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground truncate">{label}</p>
              <p className={`text-2xl font-semibold tabular-nums mt-0.5 ${valueClass ?? ""}`}>
                {value}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>
            </div>
            <div className={`size-8 shrink-0 rounded-lg border flex items-center justify-center ${iconClass}`}>
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

const REFRESH_INTERVALS = [
  { label: "10s", ms: 10_000 },
  { label: "30s", ms: 30_000 },
  { label: "1m", ms: 60_000 },
  { label: "5m", ms: 300_000 },
] as const;

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [recentRuns, setRecentRuns] = useState<(JobRun & { jobName: string })[]>([]);
  const [jobStatsMap, setJobStatsMap] = useState<Map<string, JobStats>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshPaused, setRefreshPaused] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30_000);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useRelativeTime();

  const fetchData = useCallback(() => {
    setRefreshing(true);
    return Promise.all([
      api<DashboardStats>("/api/v1/dashboard"),
      api<Monitor[]>("/api/v1/monitors"),
      api<Incident[]>("/api/v1/incidents"),
      api<Job[]>("/api/v1/jobs").catch(() => [] as Job[]),
    ])
      .then(async ([s, m, i, j]) => {
        setStats(s);
        setMonitors(m);
        setIncidents(i);
        setJobs(j);
        setLastRefresh(new Date());

        // Fetch recent runs and stats for each job (in parallel)
        if (j.length > 0) {
          const [runsPerJob, statsPerJob] = await Promise.all([
            Promise.all(
              j.slice(0, 20).map((job) =>
                api<JobRun[]>(`/api/v1/jobs/${job.id}/runs?limit=5`)
                  .then((runs) => runs.map((r) => ({ ...r, jobName: job.name })))
                  .catch(() => [] as (JobRun & { jobName: string })[]),
              ),
            ),
            Promise.all(
              j.slice(0, 20).map((job) =>
                api<JobStats>(`/api/v1/jobs/${job.id}/stats`)
                  .then((s) => [job.id, s] as const)
                  .catch(() => null),
              ),
            ),
          ]);

          const allRuns = runsPerJob
            .flat()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 15);
          setRecentRuns(allRuns);

          const statsMap = new Map<string, JobStats>();
          for (const entry of statsPerJob) {
            if (entry) statsMap.set(entry[0], entry[1]);
          }
          setJobStatsMap(statsMap);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!refreshPaused) {
      intervalRef.current = setInterval(fetchData, refreshInterval);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshPaused, refreshInterval, fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    );
  }

  if (!error && monitors.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Welcome to Kast. Let&apos;s set up your first monitor.
          </p>
        </div>
        <Onboarding />
      </motion.div>
    );
  }

  const downCount = stats?.monitors.down ?? 0;
  const openIncidentCount = stats?.openIncidents ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Overview of all monitored jobs and pipelines
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Auto-refresh controls */}
          <div className="hidden sm:flex items-center gap-1 border border-border rounded-md p-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setRefreshPaused((p) => !p)}
              title={refreshPaused ? "Resume auto-refresh" : "Pause auto-refresh"}
            >
              {refreshPaused ? <Play className="size-3" /> : <Pause className="size-3" />}
            </Button>
            {REFRESH_INTERVALS.map((opt) => (
              <Button
                key={opt.ms}
                variant={refreshInterval === opt.ms && !refreshPaused ? "secondary" : "ghost"}
                size="xs"
                className="text-[10px] h-5 px-1.5"
                onClick={() => {
                  setRefreshInterval(opt.ms);
                  setRefreshPaused(false);
                }}
              >
                {opt.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => fetchData()}
              disabled={refreshing}
              title="Refresh now"
            >
              <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => fetchData()}
            disabled={refreshing}
            className="sm:hidden"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => router.push("/monitors")}>
            <Plus className="size-3.5" />
            New Monitor
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <ErrorBanner
          message="Failed to load dashboard"
          description={`${error}. Make sure the API is running on ${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}`}
          onDismiss={() => setError(null)}
          onRetry={() => { setError(null); fetchData(); }}
        />
      )}

      {/* Stat Cards */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      >
        <StatCard
          label="Total Monitors"
          value={stats?.monitors.total ?? 0}
          sub={`${stats?.monitors.paused ?? 0} paused`}
          icon={<Activity className="size-4 text-primary" />}
          iconClass="bg-primary/5 border-primary/10"
        />
        <StatCard
          label="Healthy"
          value={stats?.monitors.healthy ?? 0}
          valueClass="text-alive"
          sub="All operational"
          icon={<CheckCircle2 className="size-4 text-alive" />}
          iconClass="bg-alive/5 border-alive/10"
        />
        <StatCard
          label="Down"
          value={downCount}
          valueClass={downCount > 0 ? "text-critical" : ""}
          sub={downCount > 0 ? "Needs attention" : "No issues"}
          icon={<XCircle className={`size-4 ${downCount > 0 ? "text-critical" : "text-muted-foreground"}`} />}
          iconClass={downCount > 0 ? "bg-critical/10 border-critical/20" : "bg-muted border-border"}
          cardClass={downCount > 0 ? "ring-1 ring-critical/30 glow-critical" : ""}
        />
        <StatCard
          label="Open Incidents"
          value={openIncidentCount}
          valueClass={openIncidentCount > 0 ? "text-critical" : ""}
          sub={openIncidentCount > 0 ? "Active incidents" : "No incidents"}
          icon={<AlertTriangle className={`size-4 ${openIncidentCount > 0 ? "text-critical" : "text-muted-foreground"}`} />}
          iconClass={openIncidentCount > 0 ? "bg-critical/10 border-critical/20" : "bg-muted border-border"}
          cardClass={openIncidentCount > 0 ? "ring-1 ring-critical/30 glow-critical" : ""}
        />
        <StatCard
          label="Active Jobs"
          value={jobs.filter((j) => j.status === "active").length}
          valueClass="text-primary"
          sub="Scheduled & running"
          icon={<Zap className="size-4 text-primary" />}
          iconClass="bg-primary/5 border-primary/10"
        />
        <StatCard
          label="Total Jobs"
          value={jobs.length}
          sub={`${jobs.filter((j) => j.status === "paused").length} paused`}
          icon={<Activity className="size-4 text-muted-foreground" />}
          iconClass="bg-muted border-border"
        />
      </motion.div>

      {/* Content Tabs */}
      <Tabs defaultValue="monitors">
        <div className="flex items-center justify-between mb-1">
          <TabsList>
            <TabsTrigger value="monitors">All Monitors</TabsTrigger>
            <TabsTrigger value="incidents">
              Incidents
              {openIncidentCount > 0 && (
                <span className="ml-1.5 size-4 rounded-full bg-critical/15 text-critical text-[10px] font-medium inline-flex items-center justify-center">
                  {openIncidentCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="jobs">
              Jobs
              {jobs.length > 0 && (
                <span className="ml-1.5 size-4 rounded-full bg-primary/15 text-primary text-[10px] font-medium inline-flex items-center justify-center">
                  {jobs.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="monitors">
          <Card>
            <CardHeader>
              <CardTitle>Monitors</CardTitle>
              <CardDescription>Current status of all monitored jobs</CardDescription>
            </CardHeader>
            <CardContent>
              {monitors.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No monitors configured yet.
                </p>
              ) : (
                <motion.div
                  variants={stagger}
                  initial="hidden"
                  animate="show"
                  className="grid gap-2 md:grid-cols-2 lg:grid-cols-3"
                >
                  {monitors.map((m) => (
                    <motion.div key={m.id} variants={fadeUp} className="h-full">
                      <Link
                        href={`/monitors/${m.id}`}
                        className="group relative flex items-start justify-between rounded-lg border border-border bg-surface/50 p-3 h-full transition-all hover:border-primary/20 hover:bg-surface"
                      >
                        <div
                          className={`absolute inset-y-0 left-0 w-0.5 rounded-l-lg ${
                            m.status === "healthy"
                              ? "bg-alive"
                              : m.status === "late"
                                ? "bg-warn"
                                : m.status === "down"
                                  ? "bg-critical"
                                  : "bg-neutral"
                          }`}
                        />
                        <div className="ml-2 min-w-0 flex-1">
                          <p className="text-sm font-medium truncate group-hover:text-foreground">
                            {m.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] text-muted-foreground font-mono truncate">
                              {m.schedule ?? (m.intervalSeconds ? `Every ${m.intervalSeconds}s` : "No schedule")}
                            </span>
                            <span className="text-border">|</span>
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
                              <Clock className="size-2.5" />
                              <RelativeTime date={m.lastPingAt} />
                            </span>
                          </div>
                          {/* Fixed-height slot for uptime bar to keep cards same size */}
                          <div className="h-[18px]">
                            <MiniUptimeBar monitorId={m.id} />
                          </div>
                        </div>
                        <div className="shrink-0 ml-2">
                          <StatusBadge status={m.status} />
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incidents">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Incidents</CardTitle>
                  <CardDescription>Active and recent incidents across all monitors</CardDescription>
                </div>
                <Link href="/incidents">
                  <Button variant="ghost" size="xs">
                    View all
                    <ArrowRight className="size-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Monitor</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incidents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                          <CheckCircle2 className="size-6 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">No incidents recorded</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      incidents.slice(0, 10).map((inc) => (
                        <TableRow
                          key={inc.id}
                          className="cursor-pointer hover:bg-accent/50"
                          onClick={() => router.push(`/incidents/${inc.id}`)}
                        >
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                inc.status === "open"
                                  ? "bg-critical/10 text-critical border-critical/20"
                                  : inc.status === "acknowledged"
                                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                    : "bg-neutral/10 text-neutral border-neutral/20"
                              }
                            >
                              {inc.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {inc.monitorId.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                            {inc.reason ?? "Unknown"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">
                            <RelativeTime date={inc.startedAt} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">
                            {formatDuration(inc.downtimeSeconds)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4">
          {/* Job Cards */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Jobs</CardTitle>
                  <CardDescription>Scheduled jobs with execution stats</CardDescription>
                </div>
                <Link href="/jobs">
                  <Button variant="ghost" size="xs">
                    View all
                    <ArrowRight className="size-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No jobs configured yet.
                </p>
              ) : (
                <motion.div
                  variants={stagger}
                  initial="hidden"
                  animate="show"
                  className="grid gap-2 md:grid-cols-2 lg:grid-cols-3"
                >
                  {jobs.map((j) => {
                    const jStats = jobStatsMap.get(j.id);
                    const successRate = jStats?.runs.successRate;
                    return (
                      <motion.div key={j.id} variants={fadeUp}>
                        <Link
                          href={`/jobs/${j.id}`}
                          className="group relative flex flex-col rounded-lg border border-border bg-surface/50 p-3 transition-all hover:border-primary/20 hover:bg-surface"
                        >
                          <div
                            className={`absolute inset-y-0 left-0 w-0.5 rounded-l-lg ${
                              j.status === "active"
                                ? "bg-alive"
                                : "bg-neutral"
                            }`}
                          />
                          <div className="ml-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium truncate group-hover:text-foreground">
                                {j.name}
                              </p>
                              <JobStatusBadge status={j.status} />
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] text-muted-foreground font-mono truncate">
                                {j.schedule}
                              </span>
                              <span className="text-border">|</span>
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
                                <Clock className="size-2.5" />
                                <RelativeTime date={j.lastRunAt} />
                              </span>
                            </div>

                            {/* Stats row */}
                            {jStats && (
                              <div className="flex items-center gap-3 mt-2 text-[11px]">
                                <span className={`font-medium tabular-nums ${
                                  (successRate ?? 0) >= 95 ? "text-alive" : (successRate ?? 0) >= 80 ? "text-warn" : "text-critical"
                                }`}>
                                  {successRate != null ? `${successRate}%` : "\u2014"}
                                </span>
                                <span className="text-muted-foreground tabular-nums">
                                  {jStats.runs.total} runs
                                </span>
                                {jStats.runs.failures > 0 && (
                                  <span className="text-critical tabular-nums">
                                    {jStats.runs.failures} failed
                                  </span>
                                )}
                                {jStats.runs.retries > 0 && (
                                  <span className="text-warn tabular-nums">
                                    {jStats.runs.retries} retries
                                  </span>
                                )}
                                {jStats.avgDurationMs != null && (
                                  <span className="text-muted-foreground font-mono tabular-nums">
                                    ~{jStats.avgDurationMs}ms
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Config badges */}
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {(j.maxRetries ?? 0) > 0 && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">
                                  {j.maxRetries} retries
                                </Badge>
                              )}
                              {(j.concurrencyLimit ?? 1) > 1 && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">
                                  {j.concurrencyLimit}x concurrency
                                </Badge>
                              )}
                              {j.concurrencyPolicy && j.concurrencyPolicy !== "queue" && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">
                                  {j.concurrencyPolicy}
                                </Badge>
                              )}
                            </div>

                            <MiniSuccessBar jobId={j.id} />
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* Recent Runs Table */}
          {recentRuns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Runs</CardTitle>
                <CardDescription>Latest job executions across all jobs</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Trigger</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentRuns.map((run) => (
                        <TableRow
                          key={run.id}
                          className="cursor-pointer hover:bg-accent/50"
                          onClick={() => router.push(`/jobs/${run.jobId}/runs/${run.id}`)}
                        >
                          <TableCell>
                            <RunStatusBadge status={run.status} />
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium">{run.jobName}</span>
                            {run.attempt > 1 && (
                              <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 bg-warn/10 text-warn border-warn/20">
                                retry #{run.attempt}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                run.trigger === "cron"
                                  ? "bg-primary/10 text-primary border-primary/20"
                                  : run.trigger === "manual"
                                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                    : "bg-warn/10 text-warn border-warn/20"
                              }`}
                            >
                              {run.trigger}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums font-mono">
                            {run.durationMs != null ? `${run.durationMs}ms` : "\u2014"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">
                            <RelativeTime date={run.startedAt ?? run.scheduledAt} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                            {run.errorMessage ?? "\u2014"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

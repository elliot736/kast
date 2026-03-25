"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { api, type Incident } from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import { useRelativeTime } from "@/hooks/use-relative-time";
import { RelativeTime } from "@/components/ui/relative-time";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Eye,
  ShieldCheck,
} from "lucide-react";

const STATUS_VALUES = ["all", "open", "acknowledged", "resolved"] as const;
type IncidentFilter = (typeof STATUS_VALUES)[number];

const statusBadgeColors: Record<string, string> = {
  open: "bg-critical/10 text-critical border-critical/20",
  acknowledged: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  resolved: "bg-neutral/10 text-neutral border-neutral/20",
};

export default function IncidentsPageWrapper() {
  return (
    <Suspense>
      <IncidentsPage />
    </Suspense>
  );
}

function IncidentsPage() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  // URL-synced filters
  const [filter, setFilter] = useQueryState(
    "status",
    parseAsStringLiteral(STATUS_VALUES).withDefault("all"),
  );

  useRelativeTime();

  useEffect(() => {
    api<Incident[]>("/api/v1/incidents")
      .then(setIncidents)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Keyboard shortcut: 'a' to acknowledge the first open incident
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === "a" && !e.metaKey && !e.ctrlKey) {
        const firstOpen = incidents.find((i) => i.status === "open");
        if (firstOpen) {
          e.preventDefault();
          handleAcknowledge(firstOpen.id);
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents]);

  const handleAcknowledge = useCallback(async (incidentId: string) => {
    setAcknowledging(incidentId);

    // Optimistic update
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === incidentId
          ? { ...inc, status: "acknowledged" as const, acknowledgedAt: new Date().toISOString() }
          : inc,
      ),
    );

    try {
      const updated = await api<Incident>(
        `/api/v1/incidents/${incidentId}/acknowledge`,
        { method: "POST" },
      );
      // Reconcile with server
      setIncidents((prev) =>
        prev.map((inc) => (inc.id === updated.id ? updated : inc)),
      );
      toast.success("Incident acknowledged");
    } catch (err) {
      // Revert
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === incidentId
            ? { ...inc, status: "open" as const, acknowledgedAt: null }
            : inc,
        ),
      );
      toast.error("Failed to acknowledge", {
        description: (err as Error).message,
      });
    } finally {
      setAcknowledging(null);
    }
  }, []);

  const filteredIncidents =
    filter === "all"
      ? incidents
      : incidents.filter((inc) => inc.status === filter);

  const openCount = incidents.filter((i) => i.status === "open").length;
  const ackCount = incidents.filter((i) => i.status === "acknowledged").length;
  const resolvedCount = incidents.filter((i) => i.status === "resolved").length;

  const columns: ColumnDef<Incident>[] = [
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={`gap-1 ${statusBadgeColors[row.original.status] ?? ""}`}
        >
          {row.original.status === "open" && <AlertTriangle className="size-2.5" />}
          {row.original.status === "acknowledged" && <Eye className="size-2.5" />}
          {row.original.status === "resolved" && <CheckCircle2 className="size-2.5" />}
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "monitorId",
      header: "Monitor",
      cell: ({ row }) => (
        <Link
          href={`/monitors/${row.original.monitorId}`}
          className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.monitorId.slice(0, 8)}
        </Link>
      ),
    },
    {
      accessorKey: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground max-w-48 truncate block">
          {row.original.reason ?? "Unknown"}
        </span>
      ),
    },
    {
      accessorKey: "startedAt",
      header: "Started",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums flex items-center gap-1">
          <Clock className="size-3" />
          <RelativeTime date={row.original.startedAt} />
        </span>
      ),
    },
    {
      accessorKey: "downtimeSeconds",
      header: "Duration",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatDuration(row.original.downtimeSeconds)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      size: 80,
      enableSorting: false,
      cell: ({ row }) =>
        row.original.status === "open" ? (
          <Button
            variant="outline"
            size="xs"
            onClick={(e) => {
              e.stopPropagation();
              handleAcknowledge(row.original.id);
            }}
            disabled={acknowledging === row.original.id}
          >
            <ShieldCheck className="size-3" />
            {acknowledging === row.original.id ? "..." : "Ack"}
          </Button>
        ) : null,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    );
  }

  const filterTabs: { value: IncidentFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: incidents.length },
    { value: "open", label: "Open", count: openCount },
    { value: "acknowledged", label: "Acknowledged", count: ackCount },
    { value: "resolved", label: "Resolved", count: resolvedCount },
  ];

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05 } },
  };
  const fadeUp = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Active and resolved incidents across all monitors
          <span className="text-muted-foreground/40 ml-2 text-xs">
            Press <kbd className="px-1 py-0.5 rounded border border-border bg-surface text-[10px] font-mono">a</kbd> to acknowledge
          </span>
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          onRetry={() => window.location.reload()}
        />
      )}

      {/* Summary Cards */}
      {incidents.length > 0 && (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-3">
          <motion.div variants={fadeUp}>
            <Card className={openCount > 0 ? "ring-1 ring-critical/30" : ""}>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Open</p>
                    <p className={`text-xl font-semibold tabular-nums ${openCount > 0 ? "text-critical" : ""}`}>
                      {openCount}
                    </p>
                  </div>
                  <div className={`size-8 rounded-lg flex items-center justify-center ${
                    openCount > 0 ? "bg-critical/10 border border-critical/20" : "bg-muted border border-border"
                  }`}>
                    <AlertTriangle className={`size-3.5 ${openCount > 0 ? "text-critical" : "text-muted-foreground"}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp}>
            <Card>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Acknowledged</p>
                    <p className="text-xl font-semibold tabular-nums">{ackCount}</p>
                  </div>
                  <div className="size-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <Eye className="size-3.5 text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp}>
            <Card>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Resolved</p>
                    <p className="text-xl font-semibold tabular-nums">{resolvedCount}</p>
                  </div>
                  <div className="size-8 rounded-lg bg-alive/10 border border-alive/20 flex items-center justify-center">
                    <CheckCircle2 className="size-3.5 text-alive" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto">
        {filterTabs.map((tab) => {
          const isActive = filter === tab.value;
          return (
            <Button
              key={tab.value}
              variant={isActive ? "secondary" : "ghost"}
              size="xs"
              className={isActive ? "bg-primary/10 text-primary border border-primary/20" : "border border-border"}
              onClick={() => setFilter(tab.value)}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1 tabular-nums ${isActive ? "text-primary/70" : "text-muted-foreground/70"}`}>
                  {tab.count}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      {/* Incidents Data Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={filteredIncidents}
            searchKey="reason"
            searchPlaceholder="Search incidents..."
            pageSize={15}
            onRowClick={(row) => router.push(`/incidents/${row.id}`)}
            emptyState={
              <EmptyState
                icon={CheckCircle2}
                title={filter === "all" ? "All clear" : `No ${filter} incidents`}
                description={filter === "all"
                  ? "No incidents recorded. Everything is running smoothly."
                  : `No ${filter} incidents found.`}
              />
            }
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}

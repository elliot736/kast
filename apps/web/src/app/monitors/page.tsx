"use client";

import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { api, type Monitor } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { StatusBadge } from "@/components/monitors/status-badge";
import { CreateMonitorForm } from "@/components/monitors/create-monitor-dialog";
import { useRelativeTime } from "@/hooks/use-relative-time";
import { RelativeTime } from "@/components/ui/relative-time";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { PingSparkline } from "@/components/monitors/ping-sparkline";
import {
  Plus,
  X,
  MoreHorizontal,
  Eye,
  Pause,
  Play,
  Trash2,
  Clock,
  AlertTriangle,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronRight,
  Monitor as MonitorIcon,
} from "lucide-react";

type StatusFilter = "all" | "healthy" | "late" | "down" | "paused";

const statusDotColor: Record<string, string> = {
  healthy: "bg-alive",
  late: "bg-warn",
  down: "bg-critical",
  paused: "bg-neutral",
};

export default function MonitorsPageWrapper() {
  return (
    <Suspense>
      <MonitorsPage />
    </Suspense>
  );
}

function MonitorsPage() {
  const router = useRouter();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Monitor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  // URL-synced filters via nuqs
  const [statusFilter, setStatusFilter] = useQueryState(
    "status",
    parseAsStringLiteral([
      "all",
      "healthy",
      "late",
      "down",
      "paused",
    ] as const).withDefault("all"),
  );
  const [search, setSearch] = useQueryState("q", { defaultValue: "" });

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // View mode: list or grouped
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");

  // Collapsed groups in grouped view
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  useRelativeTime();

  // Keyboard shortcut: 'n' to open create form
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowCreate(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    api<Monitor[]>("/api/v1/monitors")
      .then(setMonitors)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredMonitors = useMemo(() => {
    let result = monitors;
    if (statusFilter !== "all") {
      result = result.filter((m) => m.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.slug.toLowerCase().includes(q),
      );
    }
    return result;
  }, [monitors, statusFilter, search]);

  // Grouped monitors by first tag
  const groupedMonitors = useMemo(() => {
    const groups: Record<string, Monitor[]> = {};
    for (const monitor of filteredMonitors) {
      const groupKey =
        monitor.tags && monitor.tags.length > 0
          ? monitor.tags[0]
          : "Untagged";
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(monitor);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === "Untagged") return 1;
      if (b === "Untagged") return -1;
      return a.localeCompare(b);
    });
  }, [filteredMonitors]);

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredMonitors.length && prev.size > 0) {
        return new Set();
      }
      return new Set(filteredMonitors.map((m) => m.id));
    });
  }, [filteredMonitors]);

  const handleDelete = async (monitor: Monitor) => {
    setDeleting(true);
    try {
      await api(`/api/v1/monitors/${monitor.id}`, { method: "DELETE" });
      setMonitors((prev) => prev.filter((m) => m.id !== monitor.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(monitor.id);
        return next;
      });
      setDeleteTarget(null);
      toast.success(`Deleted "${monitor.name}"`);
    } catch (err) {
      toast.error("Failed to delete monitor", {
        description: (err as Error).message,
      });
    } finally {
      setDeleting(false);
    }
  };

  // Optimistic pause/resume toggle
  const handlePauseToggle = async (monitor: Monitor) => {
    const newIsPaused = !monitor.isPaused;
    const newStatus = newIsPaused ? "paused" : "healthy";

    // Optimistically update local state
    setMonitors((prev) =>
      prev.map((m) =>
        m.id === monitor.id
          ? {
              ...m,
              isPaused: newIsPaused,
              status: newStatus as Monitor["status"],
            }
          : m,
      ),
    );

    try {
      const updated = await api<Monitor>(`/api/v1/monitors/${monitor.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPaused: newIsPaused }),
      });
      // Reconcile with server response
      setMonitors((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m)),
      );
      toast.success(
        updated.isPaused
          ? `Paused "${monitor.name}"`
          : `Resumed "${monitor.name}"`,
      );
    } catch (err) {
      // Revert optimistic update
      setMonitors((prev) =>
        prev.map((m) => (m.id === monitor.id ? monitor : m)),
      );
      toast.error("Failed to update monitor", {
        description: (err as Error).message,
      });
    }
  };

  // Bulk pause selected monitors
  const handleBulkPause = async () => {
    const ids = Array.from(selectedIds);
    const targets = monitors.filter((m) => ids.includes(m.id) && !m.isPaused);
    if (targets.length === 0) {
      toast.error("No active monitors selected to pause");
      return;
    }

    // Optimistically update
    const snapshots = new Map(targets.map((m) => [m.id, m]));
    setMonitors((prev) =>
      prev.map((m) =>
        snapshots.has(m.id)
          ? { ...m, isPaused: true, status: "paused" as const }
          : m,
      ),
    );

    const failed: string[] = [];
    await Promise.allSettled(
      targets.map(async (m) => {
        try {
          const updated = await api<Monitor>(`/api/v1/monitors/${m.id}`, {
            method: "PATCH",
            body: JSON.stringify({ isPaused: true }),
          });
          setMonitors((prev) =>
            prev.map((mon) => (mon.id === updated.id ? updated : mon)),
          );
        } catch {
          failed.push(m.name);
          // Revert this one
          const original = snapshots.get(m.id)!;
          setMonitors((prev) =>
            prev.map((mon) => (mon.id === m.id ? original : mon)),
          );
        }
      }),
    );

    if (failed.length > 0) {
      toast.error(`Failed to pause: ${failed.join(", ")}`);
    } else {
      toast.success(`Paused ${targets.length} monitor(s)`);
    }
    setSelectedIds(new Set());
  };

  // Bulk delete selected monitors
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const targets = monitors.filter((m) => ids.includes(m.id));
    if (targets.length === 0) return;

    const failed: string[] = [];
    await Promise.allSettled(
      targets.map(async (m) => {
        try {
          await api(`/api/v1/monitors/${m.id}`, { method: "DELETE" });
          setMonitors((prev) => prev.filter((mon) => mon.id !== m.id));
        } catch {
          failed.push(m.name);
        }
      }),
    );

    if (failed.length > 0) {
      toast.error(`Failed to delete: ${failed.join(", ")}`);
    } else {
      toast.success(`Deleted ${targets.length} monitor(s)`);
    }
    setSelectedIds(new Set());
  };

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "healthy", label: "Healthy" },
    { value: "late", label: "Late" },
    { value: "down", label: "Down" },
    { value: "paused", label: "Paused" },
  ];

  const columns: ColumnDef<Monitor>[] = [
    {
      id: "select",
      size: 32,
      enableSorting: false,
      header: () => (
        <input
          type="checkbox"
          className="size-3.5 rounded border-border accent-primary cursor-pointer"
          checked={
            filteredMonitors.length > 0 &&
            selectedIds.size === filteredMonitors.length
          }
          onChange={toggleSelectAll}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="size-3.5 rounded border-border accent-primary cursor-pointer"
          checked={selectedIds.has(row.original.id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleSelect(row.original.id);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      id: "dot",
      size: 32,
      enableSorting: false,
      cell: ({ row }) => (
        <span
          className={`inline-block size-2 rounded-full ${statusDotColor[row.original.status] ?? "bg-neutral"}`}
        />
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <Link
            href={`/monitors/${row.original.id}`}
            className="font-medium text-sm hover:text-primary transition-colors"
          >
            {row.original.name}
          </Link>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            {row.original.slug}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "schedule",
      header: "Schedule",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.schedule ??
            (row.original.intervalSeconds
              ? `Every ${row.original.intervalSeconds}s`
              : "\u2014")}
        </span>
      ),
    },
    {
      accessorKey: "lastPingAt",
      header: "Last Ping",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums flex items-center gap-1">
          <Clock className="size-3" />
          <RelativeTime date={row.original.lastPingAt} />
          <PingSparkline monitorId={row.original.id} />
        </span>
      ),
    },
    {
      accessorKey: "nextExpectedAt",
      header: "Next Expected",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {row.original.nextExpectedAt
            ? new Date(row.original.nextExpectedAt).toLocaleTimeString()
            : "\u2014"}
        </span>
      ),
    },
    {
      id: "actions",
      size: 32,
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => router.push(`/monitors/${row.original.id}`)}
            >
              <Eye className="size-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handlePauseToggle(row.original)}
            >
              {row.original.isPaused ? (
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
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monitors</h1>
          <p className="text-muted-foreground text-sm mt-1">
            All configured job and pipeline monitors
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? (
            <>
              <X className="size-3.5" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              New Monitor
            </>
          )}
        </Button>
      </div>

      {/* Error Banner */}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Create Form */}
      {showCreate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          <CreateMonitorForm
            onCreated={(monitor) => {
              setMonitors((prev) => [monitor, ...prev]);
              setShowCreate(false);
              toast.success(`Created "${monitor.name}"`);
            }}
            onCancel={() => setShowCreate(false)}
          />
        </motion.div>
      )}

      {/* Status Filter Bar + View Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto">
          {filterOptions.map((opt) => {
            const isActive = statusFilter === opt.value;
            const count =
              opt.value === "all"
                ? monitors.length
                : monitors.filter((m) => m.status === opt.value).length;
            return (
              <Button
                key={opt.value}
                variant={isActive ? "secondary" : "ghost"}
                size="xs"
                className={
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "border border-border"
                }
                onClick={() => setStatusFilter(opt.value)}
              >
                {opt.value !== "all" && (
                  <span
                    className={`size-1.5 rounded-full mr-1 ${statusDotColor[opt.value] ?? "bg-neutral"}`}
                  />
                )}
                {opt.label}
                <span
                  className={`ml-1 tabular-nums ${isActive ? "text-primary/70" : "text-muted-foreground/70"}`}
                >
                  {count}
                </span>
              </Button>
            );
          })}
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5">
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon-xs"
            onClick={() => setViewMode("list")}
            title="List view"
          >
            <List className="size-3.5" />
          </Button>
          <Button
            variant={viewMode === "grouped" ? "secondary" : "ghost"}
            size="icon-xs"
            onClick={() => setViewMode("grouped")}
            title="Grouped view"
          >
            <LayoutGrid className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Monitors Data Table - List View */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-0">
            <DataTable
              columns={columns}
              data={filteredMonitors}
              searchKey="name"
              searchPlaceholder="Search monitors..."
              pageSize={15}
              emptyState={
                monitors.length === 0 ? (
                  <EmptyState
                    icon={MonitorIcon}
                    title="No monitors yet"
                    description="Create your first monitor to start tracking job health."
                    action={{ label: "New Monitor", onClick: () => setShowCreate(true) }}
                  />
                ) : (
                  <EmptyState
                    icon={MonitorIcon}
                    title="No matches"
                    description="No monitors match the selected filter."
                  />
                )
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Monitors Grouped View */}
      {viewMode === "grouped" && (
        <div className="space-y-3">
          {groupedMonitors.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  {monitors.length === 0
                    ? 'No monitors configured yet. Click "New Monitor" to create one.'
                    : "No monitors match the selected filter."}
                </p>
              </CardContent>
            </Card>
          )}
          {groupedMonitors.map(([group, groupMonitors]) => {
            const isCollapsed = collapsedGroups.has(group);
            return (
              <Card key={group}>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-accent/50 transition-colors rounded-t-lg"
                  onClick={() => toggleGroup(group)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">{group}</span>
                  <span className="text-xs text-muted-foreground tabular-nums ml-1">
                    ({groupMonitors.length})
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <CardContent className="p-0 border-t border-border">
                        <DataTable
                          columns={columns}
                          data={groupMonitors}
                          pageSize={50}
                          emptyState={
                            <p className="text-sm text-muted-foreground">
                              No monitors in this group.
                            </p>
                          }
                        />
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5 shadow-lg"
          >
            <span className="text-sm font-medium tabular-nums">
              {selectedIds.size} selected
            </span>
            <div className="h-4 w-px bg-border" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkPause}
            >
              <Pause className="size-3.5" />
              Pause Selected
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteConfirmOpen(true)}
            >
              <Trash2 className="size-3.5" />
              Delete Selected
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setSelectedIds(new Set())}
              title="Clear selection"
            >
              <X className="size-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Monitor</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>{" "}
              and all associated ping history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Monitor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} Monitor{selectedIds.size > 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              This will permanently delete the selected monitors and all their ping history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => { setBulkDeleteConfirmOpen(false); handleBulkDelete(); }}>
              Delete {selectedIds.size} Monitor{selectedIds.size > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

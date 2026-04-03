"use client";

import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { Card, CardContent } from "@/components/ui/card";
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
import { api, type Job } from "@/lib/api";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { CreateJobForm } from "@/components/jobs/create-job-dialog";
import { MiniSuccessBar } from "@/components/jobs/mini-success-bar";
import { RelativeTime } from "@/components/ui/relative-time";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { useRelativeTime } from "@/hooks/use-relative-time";
import {
  Plus,
  X,
  MoreHorizontal,
  Eye,
  Pause,
  Play,
  Trash2,
  Clock,
  Zap,
  PlayCircle,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type StatusFilter = "all" | "active" | "paused" | "disabled";

const statusDotColor: Record<string, string> = {
  active: "bg-alive",
  paused: "bg-neutral",
  disabled: "bg-neutral",
};

export default function JobsPageWrapper() {
  return (
    <Suspense>
      <JobsPage />
    </Suspense>
  );
}

function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // View mode: list or grouped
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");

  // Collapsed groups in grouped view
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  const [statusFilter, setStatusFilter] = useQueryState(
    "status",
    parseAsStringLiteral([
      "all",
      "active",
      "paused",
      "disabled",
    ] as const).withDefault("all"),
  );
  const [search, setSearch] = useQueryState("q", { defaultValue: "" });

  useRelativeTime();

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
    api<Job[]>("/api/v1/jobs")
      .then(setJobs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (statusFilter !== "all") {
      result = result.filter((j) => j.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          j.name.toLowerCase().includes(q) ||
          j.slug.toLowerCase().includes(q),
      );
    }
    return result;
  }, [jobs, statusFilter, search]);

  // Grouped jobs by first tag
  const groupedJobs = useMemo(() => {
    const groups: Record<string, Job[]> = {};
    for (const job of filteredJobs) {
      const groupKey =
        job.tags && job.tags.length > 0 ? job.tags[0] : "Untagged";
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(job);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === "Untagged") return 1;
      if (b === "Untagged") return -1;
      return a.localeCompare(b);
    });
  }, [filteredJobs]);

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
      if (prev.size === filteredJobs.length && prev.size > 0) {
        return new Set();
      }
      return new Set(filteredJobs.map((j) => j.id));
    });
  }, [filteredJobs]);

  const handleDelete = async (job: Job) => {
    setDeleting(true);
    try {
      await api(`/api/v1/jobs/${job.id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
      setDeleteTarget(null);
      toast.success(`Deleted "${job.name}"`);
    } catch (err) {
      toast.error("Failed to delete job", {
        description: (err as Error).message,
      });
    } finally {
      setDeleting(false);
    }
  };

  // Optimistic pause/resume toggle
  const handlePauseToggle = async (job: Job) => {
    const action = job.status === "paused" ? "resume" : "pause";
    const newStatus = action === "pause" ? "paused" : "active";

    // Optimistically update local state
    setJobs((prev) =>
      prev.map((j) =>
        j.id === job.id
          ? { ...j, status: newStatus as Job["status"] }
          : j,
      ),
    );

    try {
      const updated = await api<Job>(`/api/v1/jobs/${job.id}/${action}`, {
        method: "POST",
      });
      // Reconcile with server response
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      toast.success(action === "pause" ? `Paused "${job.name}"` : `Resumed "${job.name}"`);
    } catch (err) {
      // Revert optimistic update
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? job : j)),
      );
      toast.error(`Failed to ${action} job`, {
        description: (err as Error).message,
      });
    }
  };

  // Bulk pause selected jobs
  const handleBulkPause = async () => {
    const ids = Array.from(selectedIds);
    const targets = jobs.filter((j) => ids.includes(j.id) && j.status !== "paused");
    if (targets.length === 0) {
      toast.error("No active jobs selected to pause");
      return;
    }

    // Optimistically update
    const snapshots = new Map(targets.map((j) => [j.id, j]));
    setJobs((prev) =>
      prev.map((j) =>
        snapshots.has(j.id)
          ? { ...j, status: "paused" as const }
          : j,
      ),
    );

    const failed: string[] = [];
    await Promise.allSettled(
      targets.map(async (j) => {
        try {
          const updated = await api<Job>(`/api/v1/jobs/${j.id}/pause`, {
            method: "POST",
          });
          setJobs((prev) =>
            prev.map((job) => (job.id === updated.id ? updated : job)),
          );
        } catch {
          failed.push(j.name);
          const original = snapshots.get(j.id)!;
          setJobs((prev) =>
            prev.map((job) => (job.id === j.id ? original : job)),
          );
        }
      }),
    );

    if (failed.length > 0) {
      toast.error(`Failed to pause: ${failed.join(", ")}`);
    } else {
      toast.success(`Paused ${targets.length} job(s)`);
    }
    setSelectedIds(new Set());
  };

  // Bulk delete selected jobs
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const targets = jobs.filter((j) => ids.includes(j.id));
    if (targets.length === 0) return;

    const failed: string[] = [];
    await Promise.allSettled(
      targets.map(async (j) => {
        try {
          await api(`/api/v1/jobs/${j.id}`, { method: "DELETE" });
          setJobs((prev) => prev.filter((job) => job.id !== j.id));
        } catch {
          failed.push(j.name);
        }
      }),
    );

    if (failed.length > 0) {
      toast.error(`Failed to delete: ${failed.join(", ")}`);
    } else {
      toast.success(`Deleted ${targets.length} job(s)`);
    }
    setSelectedIds(new Set());
  };

  const handleTrigger = async (job: Job) => {
    try {
      await api(`/api/v1/jobs/${job.id}/trigger`, { method: "POST" });
      toast.success(`Triggered "${job.name}"`);
    } catch (err) {
      toast.error("Failed to trigger job", {
        description: (err as Error).message,
      });
    }
  };

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "disabled", label: "Disabled" },
  ];

  const columns: ColumnDef<Job>[] = [
    {
      id: "select",
      size: 32,
      enableSorting: false,
      header: () => (
        <input
          type="checkbox"
          className="size-3.5 rounded border-border accent-primary cursor-pointer"
          checked={
            filteredJobs.length > 0 &&
            selectedIds.size === filteredJobs.length
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
            href={`/jobs/${row.original.id}`}
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
      cell: ({ row }) => <JobStatusBadge status={row.original.status} />,
    },
    {
      id: "schedule",
      header: "Schedule",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.schedule}
        </span>
      ),
    },
    {
      id: "url",
      header: "URL",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px] block">
          {row.original.schedule}
        </span>
      ),
    },
    {
      accessorKey: "lastRunAt",
      header: "Last Run",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums flex items-center gap-1">
          <Clock className="size-3" />
          <RelativeTime date={row.original.lastRunAt} />
          <MiniSuccessBar jobId={row.original.id} />
        </span>
      ),
    },
    {
      accessorKey: "nextRunAt",
      header: "Next Run",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {row.original.nextRunAt
            ? new Date(row.original.nextRunAt).toLocaleTimeString()
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
              onClick={() => router.push(`/jobs/${row.original.id}`)}
            >
              <Eye className="size-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleTrigger(row.original)}>
              <PlayCircle className="size-4" />
              Trigger Now
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handlePauseToggle(row.original)}>
              {row.original.status === "paused" ? (
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
          {[...Array(4)].map((_, i) => (
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
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Scheduled HTTP jobs triggered by Kast
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
              New Job
            </>
          )}
        </Button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {showCreate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          <CreateJobForm
            onCreated={(job) => {
              setJobs((prev) => [job, ...prev]);
              setShowCreate(false);
              toast.success(`Created "${job.name}"`);
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
                ? jobs.length
                : jobs.filter((j) => j.status === opt.value).length;
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

      {/* Jobs Data Table - List View */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-0">
            <DataTable
              columns={columns}
              data={filteredJobs}
              searchKey="name"
              searchPlaceholder="Search jobs..."
              pageSize={15}
              emptyState={
                jobs.length === 0 ? (
                  <EmptyState
                    icon={Zap}
                    title="No jobs yet"
                    description="Create your first job to start executing scheduled HTTP requests."
                    action={{ label: "New Job", onClick: () => setShowCreate(true) }}
                  />
                ) : (
                  <EmptyState
                    icon={Zap}
                    title="No matches"
                    description="No jobs match the selected filter."
                  />
                )
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Jobs Grouped View */}
      {viewMode === "grouped" && (
        <div className="space-y-3">
          {groupedJobs.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  {jobs.length === 0
                    ? 'No jobs configured yet. Click "New Job" to create one.'
                    : "No jobs match the selected filter."}
                </p>
              </CardContent>
            </Card>
          )}
          {groupedJobs.map(([group, groupJobs]) => {
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
                    ({groupJobs.length})
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
                          data={groupJobs}
                          pageSize={50}
                          emptyState={
                            <p className="text-sm text-muted-foreground">
                              No jobs in this group.
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
            <DialogTitle>Delete Job</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>{" "}
              and all associated run history. This action cannot be undone.
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
              {deleting ? "Deleting..." : "Delete Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} Job{selectedIds.size > 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              This will permanently delete the selected jobs and all their run history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => { setBulkDeleteConfirmOpen(false); handleBulkDelete(); }}>
              Delete {selectedIds.size} Job{selectedIds.size > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

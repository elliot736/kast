"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Users,
  Plus,
  Trash2,
  ChevronUp,
  UserCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";

interface Team {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);

  useEffect(() => {
    api<Team[]>("/api/v1/teams")
      .then(setTeams)
      .catch((err) => setError(err.message));
  }, []);

  const handleCreate = async () => {
    try {
      setError(null);
      const team = await api<Team>("/api/v1/teams", {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });
      setTeams((prev) => [...prev, team]);
      setName("");
      setSlug("");
      setShowForm(false);
      toast.success(`Created team "${team.name}"`);
    } catch (err) {
      toast.error("Failed to create team", { description: (err as Error).message });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/v1/teams/${id}`, { method: "DELETE" });
      setTeams((prev) => prev.filter((t) => t.id !== id));
      setDeleteTarget(null);
      toast.success("Team deleted");
    } catch (err) {
      toast.error("Failed to delete team", { description: (err as Error).message });
    }
  };

  const columns: ColumnDef<Team>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium text-sm">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "slug",
      header: "Slug",
      cell: ({ row }) => (
        <code className="font-mono text-xs text-muted-foreground bg-surface px-1.5 py-0.5 rounded border border-border">
          {row.original.slug}
        </code>
      ),
    },
    {
      id: "members",
      header: "Members",
      enableSorting: false,
      cell: () => (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <UserCircle className="size-3.5" />
          --
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {new Date(row.original.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      size: 48,
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="xs"
          className="text-critical"
          onClick={() => setDeleteTarget(row.original)}
        >
          <Trash2 className="size-3" />
        </Button>
      ),
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Organize monitors and route alerts by team
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? (
            <>
              <ChevronUp className="size-3.5 mr-1.5" />
              Close
            </>
          ) : (
            <>
              <Plus className="size-3.5 mr-1.5" />
              New Team
            </>
          )}
        </Button>
      </div>

      <Breadcrumbs items={[
        { label: "Settings", href: "/settings" },
        { label: "Teams" },
      ]} />
      <SettingsNav />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center">
                <Users className="size-3.5 text-primary" />
              </div>
              <CardTitle>Create Team</CardTitle>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, ""),
                    );
                  }}
                  placeholder="Backend Team"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Slug</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="backend-team"
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <div className="mt-4">
              <Button size="sm" onClick={handleCreate}>Create Team</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <CardTitle>All Teams</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          <DataTable
            columns={columns}
            data={teams}
            searchKey="name"
            searchPlaceholder="Search teams..."
            pageSize={10}
            emptyState={
              <EmptyState
                icon={Users}
                title="No teams created yet"
                description='Click "New Team" to get started.'
              />
            }
          />
        </CardContent>
      </Card>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Team</DialogTitle>
            <DialogDescription>
              This will permanently delete the team{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>
              . All monitor assignments for this team will be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
            >
              Delete Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

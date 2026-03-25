"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DataTable } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Bell,
  Plus,
  Trash2,
  Hash,
  Mail,
  Globe,
  MessageSquare,
  Send,
  ChevronUp,
  Power,
  PowerOff,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";

interface AlertConfig {
  id: string;
  monitorId: string;
  channel: string;
  destination: string;
  config: Record<string, unknown>;
  cooldownMinutes: number;
  thresholdFailures: number;
  isEnabled: boolean;
  createdAt: string;
}

const CHANNELS = [
  "slack",
  "discord",
  "email",
  "webhook",
  "pagerduty",
  "telegram",
] as const;

const channelIcons: Record<string, React.ReactNode> = {
  slack: <Hash className="size-3.5" />,
  discord: <MessageSquare className="size-3.5" />,
  email: <Mail className="size-3.5" />,
  webhook: <Globe className="size-3.5" />,
  pagerduty: <Bell className="size-3.5" />,
  telegram: <Send className="size-3.5" />,
};

const channelBadgeStyle: Record<string, string> = {
  slack: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  discord: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  email: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  webhook: "bg-alive/10 text-alive border-alive/20",
  pagerduty: "bg-warn/10 text-warn border-warn/20",
  telegram: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

const placeholders: Record<string, string> = {
  slack: "#alerts",
  discord: "https://discord.com/api/webhooks/...",
  email: "alerts@example.com",
  webhook: "https://example.com/webhook",
  pagerduty: "service-key",
  telegram: "chat_id",
};

interface NewAlertForm {
  monitorId: string;
  channel: string;
  destination: string;
  cooldownMinutes: number;
  thresholdFailures: number;
}

export default function AlertsSettingsPage() {
  const [configs, setConfigs] = useState<AlertConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AlertConfig | null>(null);
  const [form, setForm] = useState<NewAlertForm>({
    monitorId: "",
    channel: "slack",
    destination: "",
    cooldownMinutes: 30,
    thresholdFailures: 1,
  });

  const fetchConfigs = () =>
    api<AlertConfig[]>("/api/v1/alert-configs")
      .then(setConfigs)
      .catch((err) => setError(err.message));

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api<AlertConfig>("/api/v1/alert-configs", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({
        monitorId: "",
        channel: "slack",
        destination: "",
        cooldownMinutes: 30,
        thresholdFailures: 1,
      });
      fetchConfigs();
      toast.success("Alert configuration created");
    } catch (err) {
      toast.error("Failed to create alert", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/v1/alert-configs/${id}`, { method: "DELETE" });
      setConfigs((prev) => prev.filter((c) => c.id !== id));
      setDeleteTarget(null);
      toast.success("Alert configuration deleted");
    } catch (err) {
      toast.error("Failed to delete alert", { description: (err as Error).message });
    }
  };

  const toggleEnabled = async (config: AlertConfig) => {
    try {
      const updated = await api<AlertConfig>(
        `/api/v1/alert-configs/${config.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isEnabled: !config.isEnabled }),
        },
      );
      setConfigs((prev) =>
        prev.map((c) => (c.id === config.id ? updated : c)),
      );
      toast.success(updated.isEnabled ? "Alert enabled" : "Alert disabled");
    } catch (err) {
      toast.error("Failed to update alert", { description: (err as Error).message });
    }
  };

  const columns: ColumnDef<AlertConfig>[] = [
    {
      accessorKey: "channel",
      header: "Channel",
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={`text-[10px] gap-1 ${channelBadgeStyle[row.original.channel] ?? ""}`}
        >
          {channelIcons[row.original.channel]}
          {row.original.channel}
        </Badge>
      ),
    },
    {
      accessorKey: "destination",
      header: "Destination",
      cell: ({ row }) => (
        <code className="text-xs font-mono max-w-[200px] truncate block text-muted-foreground">
          {row.original.destination}
        </code>
      ),
    },
    {
      accessorKey: "monitorId",
      header: "Monitor",
      cell: ({ row }) => (
        <code className="text-xs font-mono text-muted-foreground">
          {row.original.monitorId.slice(0, 8)}
        </code>
      ),
    },
    {
      accessorKey: "cooldownMinutes",
      header: "Cooldown",
      cell: ({ row }) => (
        <span className="text-xs tabular-nums">{row.original.cooldownMinutes}m</span>
      ),
    },
    {
      accessorKey: "thresholdFailures",
      header: "Threshold",
      cell: ({ row }) => (
        <span className="text-xs tabular-nums">{row.original.thresholdFailures}x</span>
      ),
    },
    {
      accessorKey: "isEnabled",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={`gap-1.5 text-[10px] ${
            row.original.isEnabled
              ? "bg-alive/10 text-alive border-alive/20"
              : "bg-neutral/10 text-neutral border-neutral/20"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              row.original.isEnabled ? "bg-alive animate-pulse-dot" : "bg-neutral"
            }`}
          />
          {row.original.isEnabled ? "Active" : "Disabled"}
        </Badge>
      ),
    },
    {
      id: "actions",
      size: 120,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => toggleEnabled(row.original)}
          >
            {row.original.isEnabled ? (
              <>
                <PowerOff className="size-3 mr-1" />
                Disable
              </>
            ) : (
              <>
                <Power className="size-3 mr-1" />
                Enable
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="text-critical"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alert Channels</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure notification channels for monitors
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? (
            <>
              <ChevronUp className="size-3.5 mr-1.5" />
              Close
            </>
          ) : (
            <>
              <Plus className="size-3.5 mr-1.5" />
              New Alert
            </>
          )}
        </Button>
      </div>

      <Breadcrumbs items={[
        { label: "Settings", href: "/settings" },
        { label: "Alerts" },
      ]} />
      <SettingsNav />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center">
                <Bell className="size-3.5 text-primary" />
              </div>
              <div>
                <CardTitle>New Alert Configuration</CardTitle>
                <CardDescription>
                  Create a new notification channel for a monitor
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Channel</Label>
                <Select
                  value={form.channel}
                  onValueChange={(val) =>
                    setForm((f) => ({ ...f, channel: val as string }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((ch) => (
                      <SelectItem key={ch} value={ch}>
                        {channelIcons[ch]}
                        <span className="capitalize">{ch}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Monitor ID</Label>
                <Input
                  value={form.monitorId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, monitorId: e.target.value }))
                  }
                  placeholder="Monitor UUID"
                  className="font-mono text-xs"
                  required
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Destination</Label>
                <Input
                  value={form.destination}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, destination: e.target.value }))
                  }
                  placeholder={placeholders[form.channel] ?? "Destination"}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Cooldown (minutes)</Label>
                <Input
                  type="number"
                  value={form.cooldownMinutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cooldownMinutes: Number(e.target.value),
                    }))
                  }
                  min={0}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Threshold Failures</Label>
                <Input
                  type="number"
                  value={form.thresholdFailures}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      thresholdFailures: Number(e.target.value),
                    }))
                  }
                  min={1}
                />
              </div>

              <div className="sm:col-span-2 pt-1">
                <Button size="sm" type="submit" disabled={saving}>
                  {saving ? "Creating..." : "Create Alert"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-muted-foreground" />
            <CardTitle>Configured Alerts</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          <DataTable
            columns={columns}
            data={configs}
            searchKey="channel"
            searchPlaceholder="Filter alerts..."
            pageSize={10}
            emptyState={
              <EmptyState
                icon={Bell}
                title="No alert channels configured"
                description='Click "New Alert" to create one.'
              />
            }
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Alert Configuration</DialogTitle>
            <DialogDescription>
              This will permanently delete the{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.channel}
              </span>{" "}
              alert for monitor{" "}
              <code className="font-mono bg-surface px-1 py-0.5 rounded text-xs border border-border">
                {deleteTarget?.monitorId.slice(0, 8)}
              </code>
              . This action cannot be undone.
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
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

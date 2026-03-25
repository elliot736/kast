"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { MailX, RotateCcw } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";

interface DeadLetter {
  id: string;
  incidentId: string;
  alertConfigId: string;
  channel: string;
  status: string;
  attempts: number;
  lastError: string | null;
  response: unknown;
  sentAt: string;
}

const channelBadgeStyle: Record<string, string> = {
  slack: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  discord: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  email: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  webhook: "bg-alive/10 text-alive border-alive/20",
  pagerduty: "bg-warn/10 text-warn border-warn/20",
  telegram: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

export default function DeadLettersPage() {
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    api<DeadLetter[]>("/api/v1/dead-letters")
      .then(setDeadLetters)
      .catch((err) => setError(err.message));
  }, []);

  const handleRetry = async (id: string) => {
    setRetrying(id);
    try {
      await api(`/api/v1/dead-letters/${id}/retry`, { method: "POST" });
      setDeadLetters((prev) => prev.filter((d) => d.id !== id));
      toast.success("Retrying delivery...");
    } catch (err) {
      toast.error("Retry failed", { description: (err as Error).message });
    } finally {
      setRetrying(null);
    }
  };

  const columns: ColumnDef<DeadLetter>[] = [
    {
      accessorKey: "channel",
      header: "Channel",
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={`text-[10px] ${channelBadgeStyle[row.original.channel] ?? "bg-surface text-muted-foreground border-border"}`}
        >
          {row.original.channel}
        </Badge>
      ),
    },
    {
      accessorKey: "incidentId",
      header: "Incident",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.incidentId.slice(0, 8)}
        </span>
      ),
    },
    {
      accessorKey: "attempts",
      header: "Attempts",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.attempts}</span>
      ),
    },
    {
      accessorKey: "lastError",
      header: "Error",
      cell: ({ row }) => (
        <span className="text-xs text-critical max-w-xs truncate block">
          {row.original.lastError ?? "Unknown error"}
        </span>
      ),
    },
    {
      accessorKey: "sentAt",
      header: "Failed At",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums font-mono">
          {new Date(row.original.sentAt).toLocaleString()}
        </span>
      ),
    },
    {
      id: "actions",
      size: 80,
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="xs"
          onClick={() => handleRetry(row.original.id)}
          disabled={retrying === row.original.id}
        >
          <RotateCcw className={`size-3 ${retrying === row.original.id ? "animate-spin" : ""}`} />
          {retrying === row.original.id ? "..." : "Retry"}
        </Button>
      ),
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dead Letters</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Failed alert deliveries. Inspect errors and retry.
        </p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={deadLetters}
            searchKey="channel"
            searchPlaceholder="Filter by channel..."
            pageSize={15}
            emptyState={
              <EmptyState
                icon={MailX}
                title="No failed deliveries"
                description="All alerts are being sent successfully."
              />
            }
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}

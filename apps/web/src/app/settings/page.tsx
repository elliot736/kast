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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Key, Copy, Check, Shield, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";

interface ApiKey {
  id: string;
  keyPrefix: string;
  label: string | null;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);

  useEffect(() => {
    api<ApiKey[]>("/api/v1/api-keys")
      .then(setKeys)
      .catch((err) => setError(err.message));
  }, []);

  const handleCreate = async () => {
    try {
      setError(null);
      const result = await api<{ key: string; id: string }>(
        "/api/v1/api-keys",
        {
          method: "POST",
          body: JSON.stringify({ label: newKeyLabel || "default" }),
        },
      );
      setRevealedKey(result.key);
      setNewKeyLabel("");
      setCopied(false);
      const updated = await api<ApiKey[]>("/api/v1/api-keys");
      setKeys(updated);
      toast.success("API key created");
    } catch (err) {
      toast.error("Failed to create API key", { description: (err as Error).message });
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await api(`/api/v1/api-keys/${id}`, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== id));
      setRevokeTarget(null);
      toast.success("API key revoked");
    } catch (err) {
      toast.error("Failed to revoke key", { description: (err as Error).message });
    }
  };

  const handleCopy = async () => {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const columns: ColumnDef<ApiKey>[] = [
    {
      accessorKey: "keyPrefix",
      header: "Prefix",
      cell: ({ row }) => (
        <code className="font-mono text-xs bg-surface px-1.5 py-0.5 rounded border border-border">
          {row.original.keyPrefix}...
        </code>
      ),
    },
    {
      accessorKey: "label",
      header: "Label",
      cell: ({ row }) => (
        <span className="font-medium text-sm">{row.original.label ?? "--"}</span>
      ),
    },
    {
      id: "scopes",
      header: "Scopes",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex gap-1 flex-wrap">
          {(row.original.scopes ?? []).map((s) => (
            <Badge key={s} variant="outline" className="text-[10px]">
              {s}
            </Badge>
          ))}
          {(!row.original.scopes || row.original.scopes.length === 0) && (
            <span className="text-xs text-muted-foreground">All scopes</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "lastUsedAt",
      header: "Last Used",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {row.original.lastUsedAt
            ? new Date(row.original.lastUsedAt).toLocaleString()
            : "Never"}
        </span>
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
      size: 80,
      enableSorting: false,
      cell: ({ row }) => (
        <Dialog
          open={revokeTarget?.id === row.original.id}
          onOpenChange={(open) => {
            if (!open) setRevokeTarget(null);
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className="text-critical"
              onClick={() => setRevokeTarget(row.original)}
            >
              <Trash2 className="size-3 mr-1" />
              Revoke
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke API Key</DialogTitle>
              <DialogDescription>
                This will permanently revoke the key{" "}
                <code className="font-mono bg-surface px-1 py-0.5 rounded text-xs border border-border">
                  {row.original.keyPrefix}...
                </code>
                . Any applications using this key will lose access immediately.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() => handleRevoke(row.original.id)}
              >
                Revoke Key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ),
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage API keys and configuration
        </p>
      </div>

      <SettingsNav />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Create API Key */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center">
              <Plus className="size-3.5 text-primary" />
            </div>
            <div>
              <CardTitle>Create API Key</CardTitle>
              <CardDescription>
                API keys authenticate requests to the management API
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Label</Label>
              <Input
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                placeholder="my-app"
              />
            </div>
            <Button size="sm" onClick={handleCreate}>
              <Key className="size-3.5 mr-1.5" />
              Create Key
            </Button>
          </div>

          {revealedKey && (
            <div className="mt-4 rounded-lg border border-warn/30 bg-warn/5 p-4">
              <p className="text-xs font-medium text-warn mb-2">
                Copy this key now -- it will not be shown again
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-background px-3 py-2 font-mono text-xs break-all select-all border border-border">
                  {revealedKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="size-3.5 text-alive" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Keys Data Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-muted-foreground" />
            <CardTitle>API Keys</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={keys}
            searchKey="label"
            searchPlaceholder="Search keys..."
            pageSize={10}
            emptyState={
              <EmptyState
                icon={Key}
                title="No API keys"
                description="Create one above to get started."
              />
            }
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}

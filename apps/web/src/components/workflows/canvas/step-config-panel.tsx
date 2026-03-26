"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkflowNodeDefinition } from "@/lib/api";
import { Trash2, X } from "lucide-react";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const FAILURE_OPTIONS = [
  { value: "abort", label: "Abort workflow" },
  { value: "continue", label: "Skip and continue" },
] as const;

export function StepConfigPanel({
  node,
  onChange,
  onDelete,
  onClose,
}: {
  node: WorkflowNodeDefinition;
  onChange: (updated: WorkflowNodeDefinition) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const config = node.config as Record<string, any>;

  const updateConfig = (patch: Record<string, unknown>) => {
    onChange({ ...node, config: { ...node.config, ...patch } });
  };

  return (
    <div className="fixed top-0 right-0 z-50 h-full w-[350px] border-l bg-card flex flex-col shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Configure Node</h3>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Node name */}
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={node.name}
              onChange={(e) => onChange({ ...node, name: e.target.value })}
              placeholder="Node name"
            />
          </div>

          {/* Node ID (read-only) */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Node ID</Label>
            <Input
              value={node.id}
              readOnly
              className="font-mono text-xs text-muted-foreground"
            />
          </div>

          {/* Type-specific config */}
          {node.type === "run" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">HTTP Method</Label>
                <Select
                  value={config.method ?? "POST"}
                  onValueChange={(val) => updateConfig({ method: val })}
                >
                  <SelectTrigger className="font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HTTP_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">URL</Label>
                <Input
                  value={config.url ?? ""}
                  onChange={(e) => updateConfig({ url: e.target.value })}
                  placeholder="https://..."
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Timeout (seconds)</Label>
                <Input
                  type="number"
                  value={config.timeoutSeconds ?? ""}
                  onChange={(e) => updateConfig({ timeoutSeconds: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="30"
                  min={1}
                />
              </div>
            </>
          )}

          {node.type === "sleep" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Duration (ISO 8601)</Label>
              <Input
                value={config.duration ?? ""}
                onChange={(e) => updateConfig({ duration: e.target.value })}
                placeholder="PT30S, PT5M, P1D"
                className="font-mono text-xs"
              />
            </div>
          )}

          {node.type === "condition" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Expression</Label>
              <textarea
                value={config.expression ?? ""}
                onChange={(e) => updateConfig({ expression: e.target.value })}
                placeholder='steps.fetch.status == 200'
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono transition-colors placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30"
              />
              <p className="text-[10px] text-muted-foreground">
                Drag from the green (true) or red (false) handle to connect branches.
              </p>
            </div>
          )}

          {node.type === "run_job" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Target Job ID</Label>
                <Input
                  value={config.targetJobId ?? ""}
                  onChange={(e) => updateConfig({ targetJobId: e.target.value })}
                  placeholder="job-uuid"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mode</Label>
                <Select
                  value={config.mode ?? "fire_and_forget"}
                  onValueChange={(val) => updateConfig({ mode: val })}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wait">Wait for completion</SelectItem>
                    <SelectItem value="fire_and_forget">Fire and forget</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {node.type === "fan_out" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Concurrency</Label>
              <Input
                type="number"
                value={config.concurrency ?? ""}
                onChange={(e) => updateConfig({ concurrency: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="All"
                min={1}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.failFast ?? false}
                  onChange={(e) => updateConfig({ failFast: e.target.checked })}
                  className="size-3.5 rounded accent-primary"
                />
                Fail fast
              </label>
            </div>
          )}

          {node.type === "webhook_wait" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Timeout (ISO 8601, optional)</Label>
              <Input
                value={config.timeoutDuration ?? ""}
                onChange={(e) => updateConfig({ timeoutDuration: e.target.value || undefined })}
                placeholder="PT5M (leave empty for no timeout)"
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Workflow pauses until an external POST is received. The webhook URL is shown in the run detail.
              </p>
            </div>
          )}

          {/* Failure policy (not for condition) */}
          {node.type !== "condition" && (
            <div className="space-y-1.5 pt-2 border-t">
              <Label className="text-xs">On Failure</Label>
              <Select
                value={node.onFailure ?? "abort"}
                onValueChange={(val) => onChange({ ...node, onFailure: val as "abort" | "continue" })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FAILURE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-4">
        <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
          <Trash2 className="size-3.5" />
          Delete Node
        </Button>
      </div>
    </div>
  );
}

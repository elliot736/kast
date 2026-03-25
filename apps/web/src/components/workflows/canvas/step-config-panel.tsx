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
import type { WorkflowStepDefinition } from "@/lib/api";
import { Plus, Trash2, X } from "lucide-react";

// ── Constants ───────────────────────────────────────────────

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const FAILURE_OPTIONS = [
  { value: "abort", label: "Abort workflow" },
  { value: "continue", label: "Skip and continue" },
  { value: "goto", label: "Go to step..." },
] as const;

// ── Panel ───────────────────────────────────────────────────

export function StepConfigPanel({
  step,
  onChange,
  onDelete,
  onClose,
}: {
  step: WorkflowStepDefinition;
  onChange: (updated: WorkflowStepDefinition) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const config = step.config as Record<string, any>;

  const updateConfig = (patch: Record<string, unknown>) => {
    onChange({ ...step, config: { ...step.config, ...patch } });
  };

  return (
    <div className="fixed top-0 right-0 z-50 h-full w-[350px] border-l bg-card flex flex-col shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Configure Step</h3>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Step name */}
          <div className="space-y-1.5">
            <Label className="text-xs">Step Name</Label>
            <Input
              value={step.name}
              onChange={(e) => onChange({ ...step, name: e.target.value })}
              placeholder="Step name"
            />
          </div>

          {/* Step ID (read-only) */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Step ID</Label>
            <Input
              value={step.id}
              readOnly
              className="font-mono text-xs text-muted-foreground"
            />
          </div>

          {/* Type-specific config */}
          {step.type === "run" && (
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
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
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
                  onChange={(e) =>
                    updateConfig({
                      timeoutSeconds: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="30"
                  min={1}
                />
              </div>
            </>
          )}

          {step.type === "sleep" && (
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

          {step.type === "spawn" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Target Job ID</Label>
                <Input
                  value={config.targetJobId ?? ""}
                  onChange={(e) =>
                    updateConfig({ targetJobId: e.target.value })
                  }
                  placeholder="job-uuid"
                  className="font-mono text-xs"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.wait ?? false}
                  onChange={(e) => updateConfig({ wait: e.target.checked })}
                  className="size-3.5 rounded accent-primary"
                />
                Wait for child to complete
              </label>
            </>
          )}

          {step.type === "signal_parent" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Payload (JSON)</Label>
              <textarea
                value={
                  typeof config.payload === "string"
                    ? config.payload
                    : JSON.stringify(config.payload ?? {}, null, 2)
                }
                onChange={(e) => {
                  try {
                    updateConfig({ payload: JSON.parse(e.target.value) });
                  } catch {
                    // Store as raw string while user types
                    updateConfig({ payload: e.target.value });
                  }
                }}
                placeholder='{"key": "value"}'
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono transition-colors placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30"
              />
            </div>
          )}

          {step.type === "signal_child" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Spawn Step ID</Label>
                <Input
                  value={config.spawnStepId ?? ""}
                  onChange={(e) =>
                    updateConfig({ spawnStepId: e.target.value })
                  }
                  placeholder="step-id of spawn step"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payload (JSON)</Label>
                <textarea
                  value={
                    typeof config.payload === "string"
                      ? config.payload
                      : JSON.stringify(config.payload ?? {}, null, 2)
                  }
                  onChange={(e) => {
                    try {
                      updateConfig({ payload: JSON.parse(e.target.value) });
                    } catch {
                      updateConfig({ payload: e.target.value });
                    }
                  }}
                  placeholder='{"key": "value"}'
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono transition-colors placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30"
                />
              </div>
            </>
          )}

          {step.type === "wait_for_signal" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Timeout Duration (ISO 8601)</Label>
              <Input
                value={config.timeoutDuration ?? ""}
                onChange={(e) =>
                  updateConfig({ timeoutDuration: e.target.value })
                }
                placeholder="PT1H (optional)"
                className="font-mono text-xs"
              />
            </div>
          )}

          {step.type === "fan_out" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Concurrency</Label>
                  <Input
                    type="number"
                    value={config.concurrency ?? ""}
                    onChange={(e) =>
                      updateConfig({
                        concurrency: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="All"
                    min={1}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">&nbsp;</Label>
                  <label className="flex items-center gap-2 text-sm h-8">
                    <input
                      type="checkbox"
                      checked={config.failFast ?? false}
                      onChange={(e) =>
                        updateConfig({ failFast: e.target.checked })
                      }
                      className="size-3.5 rounded accent-primary"
                    />
                    Fail fast
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Branches</Label>
                {((config.branches as any[]) ?? []).map(
                  (branch: any, bi: number) => (
                    <div
                      key={bi}
                      className="flex items-center gap-1.5 rounded border border-border bg-muted/30 p-1.5"
                    >
                      <Input
                        value={branch.name ?? ""}
                        onChange={(e) => {
                          const branches = [
                            ...((config.branches as any[]) ?? []),
                          ];
                          branches[bi] = {
                            ...branches[bi],
                            name: e.target.value,
                          };
                          updateConfig({ branches });
                        }}
                        placeholder="Name"
                        className="h-7 text-xs w-20"
                      />
                      <Input
                        value={branch.config?.url ?? ""}
                        onChange={(e) => {
                          const branches = [
                            ...((config.branches as any[]) ?? []),
                          ];
                          branches[bi] = {
                            ...branches[bi],
                            config: {
                              ...(branches[bi].config ?? {}),
                              url: e.target.value,
                            },
                          };
                          updateConfig({ branches });
                        }}
                        placeholder="https://..."
                        className="flex-1 h-7 text-xs font-mono"
                      />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => {
                          const branches = (
                            (config.branches as any[]) ?? []
                          ).filter((_: any, j: number) => j !== bi);
                          updateConfig({ branches });
                        }}
                      >
                        <Trash2 className="size-3 text-muted-foreground" />
                      </Button>
                    </div>
                  )
                )}
                <Button
                  variant="outline"
                  size="xs"
                  type="button"
                  onClick={() => {
                    const branches = [
                      ...((config.branches as any[]) ?? []),
                    ];
                    branches.push({
                      id: `branch-${branches.length + 1}`,
                      name: `Branch ${branches.length + 1}`,
                      config: { url: "", method: "POST" },
                    });
                    updateConfig({ branches });
                  }}
                >
                  <Plus className="size-3" />
                  Add Branch
                </Button>
              </div>
            </div>
          )}

          {/* Failure policy */}
          <div className="space-y-1.5 pt-2 border-t">
            <Label className="text-xs">On Failure</Label>
            <Select
              value={step.onFailure ?? "abort"}
              onValueChange={(val) =>
                onChange({
                  ...step,
                  onFailure: val as WorkflowStepDefinition["onFailure"],
                })
              }
            >
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FAILURE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {step.onFailure === "goto" && (
              <Input
                value={step.onFailureGoto ?? ""}
                onChange={(e) =>
                  onChange({ ...step, onFailureGoto: e.target.value })
                }
                placeholder="Target step ID"
                className="font-mono text-xs"
              />
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-4">
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          Delete Step
        </Button>
      </div>
    </div>
  );
}

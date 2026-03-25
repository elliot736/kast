"use client";

import { Badge } from "@/components/ui/badge";
import type { WorkflowStepDefinition, WorkflowStepResult } from "@/lib/api";
import { SleepCountdown } from "./sleep-countdown";
import {
  Zap,
  Moon,
  Pause,
  ArrowUp,
  ArrowDown,
  GitBranch,
  CheckCircle2,
  XCircle,
  Loader2,
  MinusCircle,
} from "lucide-react";

const typeIcons: Record<string, typeof Zap> = {
  run: Zap,
  sleep: Moon,
  spawn: GitBranch,
  signal_parent: ArrowUp,
  signal_child: ArrowDown,
  wait_for_signal: Pause,
  fan_out: GitBranch,
};

const typeLabels: Record<string, string> = {
  run: "HTTP Request",
  sleep: "Sleep",
  spawn: "Spawn",
  signal_parent: "Signal Parent",
  signal_child: "Signal Child",
  wait_for_signal: "Wait Signal",
  fan_out: "Fan Out",
};

const statusColors: Record<string, string> = {
  completed: "border-alive bg-alive/10",
  failed: "border-critical bg-critical/10",
  skipped: "border-neutral bg-neutral/10",
};

const statusIcons: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2,
  failed: XCircle,
  skipped: MinusCircle,
};

export function StepTimeline({
  steps,
  stepResults,
  currentStepIndex,
  workflowStatus,
  resumeAt,
}: {
  steps: WorkflowStepDefinition[];
  stepResults: WorkflowStepResult[];
  currentStepIndex: number | null;
  workflowStatus: string;
  resumeAt: string | null;
}) {
  const resultMap = new Map(stepResults.map((r) => [r.stepIndex, r]));

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const result = resultMap.get(i);
        const isCurrent = i === currentStepIndex;
        const isFuture = !result && !isCurrent;
        const Icon = typeIcons[step.type] ?? Zap;
        const StatusIcon = result ? statusIcons[result.status] : null;

        return (
          <div key={step.id} className="flex gap-3">
            {/* Vertical line + dot */}
            <div className="flex flex-col items-center">
              <div
                className={`size-8 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  result
                    ? statusColors[result.status]
                    : isCurrent
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/30"
                }`}
              >
                {result && StatusIcon ? (
                  <StatusIcon
                    className={`size-4 ${
                      result.status === "completed"
                        ? "text-alive"
                        : result.status === "failed"
                          ? "text-critical"
                          : "text-neutral"
                    }`}
                  />
                ) : isCurrent ? (
                  <Loader2 className="size-4 text-primary animate-spin" />
                ) : (
                  <Icon className="size-4 text-muted-foreground" />
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-px flex-1 min-h-[24px] ${
                    result ? "bg-alive/40" : "bg-border"
                  }`}
                />
              )}
            </div>

            {/* Step content */}
            <div className={`pb-4 flex-1 ${isFuture ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{step.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {typeLabels[step.type] ?? step.type}
                </Badge>
              </div>

              {/* Step details based on type */}
              {step.type === "run" && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {(step.config as any).method ?? "POST"} {(step.config as any).url}
                </p>
              )}
              {step.type === "sleep" && isCurrent && workflowStatus === "sleeping" && resumeAt && (
                <SleepCountdown resumeAt={resumeAt} />
              )}
              {step.type === "wait_for_signal" && isCurrent && workflowStatus === "waiting" && (
                <p className="text-xs text-warn mt-0.5">Waiting for signal...</p>
              )}
              {step.type === "spawn" && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {(step.config as any).waitForCompletion ? "Blocking" : "Fire & forget"}
                </p>
              )}

              {step.type === "fan_out" && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    {((step.config as any).branches ?? []).length} branches
                    {(step.config as any).concurrency && ` (concurrency: ${(step.config as any).concurrency})`}
                    {(step.config as any).failFast && " \u00b7 fail-fast"}
                  </p>
                  {result?.output && typeof result.output === "object" && (result.output as any).branches && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries((result.output as any).branches as Record<string, { status: string }>).map(([branchId, br]) => (
                        <Badge
                          key={branchId}
                          variant="outline"
                          className={`text-[9px] px-1 py-0 ${
                            br.status === "completed"
                              ? "bg-alive/10 text-alive border-alive/20"
                              : "bg-critical/10 text-critical border-critical/20"
                          }`}
                        >
                          {branchId}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Result info */}
              {result && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {result.durationMs != null && (
                    <span className="tabular-nums font-mono">{result.durationMs}ms</span>
                  )}
                  {result.errorMessage && (
                    <span className="text-critical ml-2">{result.errorMessage}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

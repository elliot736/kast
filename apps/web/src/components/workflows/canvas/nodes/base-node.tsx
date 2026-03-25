"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WorkflowStepDefinition } from "@/lib/api";
import {
  Zap,
  Moon,
  GitBranch,
  ArrowUp,
  ArrowDown,
  Pause,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  type LucideIcon,
} from "lucide-react";

// ── Step type visual config ─────────────────────────────────

interface StepTypeConfig {
  icon: LucideIcon;
  label: string;
  color: string;
  bgColor: string;
}

const STEP_TYPE_CONFIG: Record<WorkflowStepDefinition["type"], StepTypeConfig> = {
  run: { icon: Zap, label: "HTTP Request", color: "text-primary", bgColor: "bg-primary/10" },
  sleep: { icon: Moon, label: "Sleep", color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  spawn: { icon: GitBranch, label: "Spawn", color: "text-blue-400", bgColor: "bg-blue-400/10" },
  signal_parent: { icon: ArrowUp, label: "Signal Parent", color: "text-green-400", bgColor: "bg-green-400/10" },
  signal_child: { icon: ArrowDown, label: "Signal Child", color: "text-green-400", bgColor: "bg-green-400/10" },
  wait_for_signal: { icon: Pause, label: "Wait Signal", color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  fan_out: { icon: GitBranch, label: "Fan Out", color: "text-purple-400", bgColor: "bg-purple-400/10" },
};

// ── Node data interface ─────────────────────────────────────

export type StepExecutionStatus = "idle" | "running" | "completed" | "failed" | "skipped" | "sleeping" | "waiting";

export interface StepNodeData {
  step: WorkflowStepDefinition;
  index: number;
  executionStatus?: StepExecutionStatus;
  durationMs?: number;
  onSelect: (stepId: string) => void;
  onDelete: (stepId: string) => void;
  [key: string]: unknown;
}

export type StepNode = Node<StepNodeData, "step">;

// ── Execution status styles (n8n-inspired) ──────────────────

interface StatusVisual {
  bg: string;
  border: string;
  accent: string;       // left bar color
  glow: string;
}

const STATUS_VISUAL: Record<StepExecutionStatus, StatusVisual> = {
  idle:     { bg: "bg-card",              border: "border-border",       accent: "bg-border",       glow: "" },
  running:  { bg: "bg-primary/5",         border: "border-primary/50",   accent: "bg-primary",      glow: "shadow-[0_0_15px_rgba(0,229,195,0.15)]" },
  completed:{ bg: "bg-alive/5",           border: "border-alive/40",     accent: "bg-alive",        glow: "" },
  failed:   { bg: "bg-critical/5",        border: "border-critical/40",  accent: "bg-critical",     glow: "shadow-[0_0_12px_rgba(255,68,68,0.12)]" },
  skipped:  { bg: "bg-muted/50",          border: "border-border",       accent: "bg-neutral",      glow: "" },
  sleeping: { bg: "bg-yellow-500/5",      border: "border-yellow-500/40",accent: "bg-yellow-500",   glow: "" },
  waiting:  { bg: "bg-blue-400/5",        border: "border-blue-400/40",  accent: "bg-blue-400",     glow: "" },
};

// ── Base node component ─────────────────────────────────────

export function BaseNode({ data, selected }: NodeProps<StepNode>) {
  const { step, index, executionStatus, durationMs, onSelect, onDelete } = data;
  const config = STEP_TYPE_CONFIG[step.type] ?? STEP_TYPE_CONFIG.run;
  const Icon = config.icon;
  const status = executionStatus ?? "idle";
  const visual = STATUS_VISUAL[status];
  const isExecuting = status !== "idle";

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-muted-foreground !border-none"
      />

      <div
        className={`
          relative rounded-lg border overflow-hidden min-w-[240px] max-w-[300px] cursor-pointer
          transition-all duration-300
          ${visual.bg} ${visual.border} ${visual.glow}
          ${selected && !isExecuting ? "ring-2 ring-primary shadow-lg" : ""}
          ${!isExecuting ? "hover:shadow-md" : ""}
        `}
        onClick={() => onSelect(step.id)}
      >
        {/* Left accent bar */}
        <div className={`absolute inset-y-0 left-0 w-1 ${visual.accent} ${status === "running" ? "animate-pulse" : ""}`} />

        <div className="pl-4 pr-3 py-3">
          <div className="flex items-center gap-2.5">
            {/* Icon container */}
            <div className={`shrink-0 size-8 rounded-md flex items-center justify-center ${isExecuting ? "" : config.bgColor}`}>
              {status === "running" ? (
                <Loader2 className="size-4 text-primary animate-spin" />
              ) : status === "completed" ? (
                <CheckCircle2 className="size-4 text-alive" />
              ) : status === "failed" ? (
                <XCircle className="size-4 text-critical" />
              ) : status === "sleeping" ? (
                <Moon className="size-4 text-yellow-500 animate-pulse" />
              ) : status === "waiting" ? (
                <Pause className="size-4 text-blue-400 animate-pulse" />
              ) : (
                <Icon className={`size-4 ${config.color}`} />
              )}
            </div>

            {/* Name and type */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{step.name}</p>
              <p className="text-[11px] text-muted-foreground">{config.label}</p>
            </div>

            {/* Right side: badge + actions */}
            <div className="flex items-center gap-1 shrink-0">
              {durationMs != null && isExecuting && (
                <Badge variant="outline" className="text-[9px] font-mono tabular-nums px-1 py-0">
                  {durationMs}ms
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] tabular-nums">
                #{index + 1}
              </Badge>
              {!isExecuting && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(step.id);
                  }}
                >
                  <Trash2 className="size-3 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>

          {/* Config summary */}
          {step.type === "run" && (step.config as any).url && (
            <p className="mt-2 text-[10px] font-mono text-muted-foreground truncate pl-[42px]">
              {(step.config as any).method ?? "POST"} {(step.config as any).url}
            </p>
          )}
          {step.type === "sleep" && (step.config as any).duration && (
            <p className="mt-2 text-[10px] font-mono text-muted-foreground pl-[42px]">
              {(step.config as any).duration}
            </p>
          )}

          {/* Execution status text */}
          {status === "running" && (
            <p className="mt-2 text-[10px] text-primary font-medium pl-[42px] animate-pulse">Executing...</p>
          )}
          {status === "sleeping" && (
            <p className="mt-2 text-[10px] text-yellow-500 font-medium pl-[42px]">Sleeping...</p>
          )}
          {status === "waiting" && (
            <p className="mt-2 text-[10px] text-blue-400 font-medium pl-[42px]">Waiting for signal...</p>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-muted-foreground !border-none"
      />
    </>
  );
}

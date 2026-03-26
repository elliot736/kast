"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WorkflowNodeDefinition, NodeType } from "@/lib/api";
import {
  Zap,
  Moon,
  GitBranch,
  Pause,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { AddStepMenu } from "../add-step-menu";

// ── Step type visual config ─────────────────────────────────

interface StepTypeConfig {
  icon: LucideIcon;
  label: string;
  color: string;
  bgColor: string;
}

const STEP_TYPE_CONFIG: Record<string, StepTypeConfig> = {
  run: { icon: Zap, label: "HTTP Request", color: "text-primary", bgColor: "bg-primary/10" },
  sleep: { icon: Moon, label: "Sleep", color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  run_job: { icon: GitBranch, label: "Sub-workflow", color: "text-blue-400", bgColor: "bg-blue-400/10" },
  fan_out: { icon: GitBranch, label: "Fan Out", color: "text-purple-400", bgColor: "bg-purple-400/10" },
  webhook_wait: { icon: Pause, label: "Wait for Webhook", color: "text-amber-400", bgColor: "bg-amber-400/10" },
};

// ── Node data interface ─────────────────────────────────────

export type StepExecutionStatus = "idle" | "running" | "completed" | "failed" | "skipped" | "sleeping" | "waiting";

export interface StepNodeData {
  node: WorkflowNodeDefinition;
  executionStatus?: StepExecutionStatus;
  durationMs?: number;
  onSelect: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onAddFromHandle?: (type: NodeType) => void;
  [key: string]: unknown;
}

export type StepNode = Node<StepNodeData, "step">;

// ── Execution status styles ─────────────────────────────────

const STATUS_VISUAL: Record<StepExecutionStatus, { bg: string; border: string; accent: string; glow: string }> = {
  idle:     { bg: "bg-card",              border: "border-border",       accent: "bg-border",       glow: "" },
  running:  { bg: "bg-primary/5",         border: "border-primary/50",   accent: "bg-primary",      glow: "shadow-[0_0_15px_rgba(0,229,195,0.15)]" },
  completed:{ bg: "bg-alive/5",           border: "border-alive/40",     accent: "bg-alive",        glow: "" },
  failed:   { bg: "bg-critical/5",        border: "border-critical/40",  accent: "bg-critical",     glow: "shadow-[0_0_12px_rgba(255,68,68,0.12)]" },
  skipped:  { bg: "bg-muted/50",          border: "border-border",       accent: "bg-neutral",      glow: "" },
  sleeping: { bg: "bg-yellow-500/5",      border: "border-yellow-500/40",accent: "bg-yellow-500",   glow: "" },
  waiting:  { bg: "bg-amber-400/5",       border: "border-amber-400/40", accent: "bg-amber-400",    glow: "" },
};

// ── Base node component ─────────────────────────────────────

export function BaseNode({ data, selected }: NodeProps<StepNode>) {
  const { node, executionStatus, durationMs, onSelect, onDelete, onAddFromHandle } = data;
  const config = STEP_TYPE_CONFIG[node.type] ?? STEP_TYPE_CONFIG.run;
  const Icon = config.icon;
  const status = executionStatus ?? "idle";
  const visual = STATUS_VISUAL[status];
  const isExecuting = status !== "idle";

  return (
    <>
      <Handle
        id="input"
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
        onClick={() => onSelect(node.id)}
      >
        <div className={`absolute inset-y-0 left-0 w-1 ${visual.accent} ${status === "running" ? "animate-pulse" : ""}`} />

        <div className="pl-4 pr-3 py-3">
          <div className="flex items-center gap-2.5">
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
                <Pause className="size-4 text-amber-400 animate-pulse" />
              ) : (
                <Icon className={`size-4 ${config.color}`} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{node.name}</p>
              <p className="text-[11px] text-muted-foreground">{config.label}</p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {durationMs != null && isExecuting && (
                <Badge variant="outline" className="text-[9px] font-mono tabular-nums px-1 py-0">
                  {durationMs}ms
                </Badge>
              )}
              {!isExecuting && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
                >
                  <Trash2 className="size-3 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>

          {node.type === "run" && (node.config as any).url && (
            <p className="mt-2 text-[10px] font-mono text-muted-foreground truncate pl-[42px]">
              {(node.config as any).method ?? "POST"} {(node.config as any).url}
            </p>
          )}
          {node.type === "sleep" && (node.config as any).duration && (
            <p className="mt-2 text-[10px] font-mono text-muted-foreground pl-[42px]">
              {(node.config as any).duration}
            </p>
          )}
          {node.type === "webhook_wait" && (node.config as any).timeoutDuration && (
            <p className="mt-2 text-[10px] font-mono text-muted-foreground pl-[42px]">
              timeout: {(node.config as any).timeoutDuration}
            </p>
          )}

          {status === "running" && (
            <p className="mt-2 text-[10px] text-primary font-medium pl-[42px] animate-pulse">Executing...</p>
          )}
          {status === "sleeping" && (
            <p className="mt-2 text-[10px] text-yellow-500 font-medium pl-[42px]">Sleeping...</p>
          )}
          {status === "waiting" && (
            <p className="mt-2 text-[10px] text-amber-400 font-medium pl-[42px]">Waiting for webhook...</p>
          )}
        </div>
      </div>

      <Handle
        id="default"
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-muted-foreground !border-none"
      />

      {/* + button — inside the node's React Flow DOM so it scales correctly */}
      {!isExecuting && onAddFromHandle && (
        <div className="flex justify-center mt-1 nopan nodrag">
          <AddStepMenu onAdd={onAddFromHandle}>
            <button
              type="button"
              className="flex items-center justify-center w-6 h-6 rounded-full border border-border bg-card text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
            >
              <Plus className="size-3" />
            </button>
          </AddStepMenu>
        </div>
      )}
    </>
  );
}

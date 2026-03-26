"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import type { WorkflowNodeDefinition, NodeType } from "@/lib/api";
import { GitFork, CheckCircle2, XCircle, Loader2, Plus } from "lucide-react";

import type { StepExecutionStatus } from "./base-node";
import { AddStepMenu } from "../add-step-menu";

export interface ConditionNodeData {
  node: WorkflowNodeDefinition;
  executionStatus?: StepExecutionStatus;
  result?: boolean;
  onSelect: (id: string) => void;
  onAddTrue?: (type: NodeType) => void;
  onAddFalse?: (type: NodeType) => void;
  [key: string]: unknown;
}

export type ConditionNode = Node<ConditionNodeData, "condition">;

export function ConditionNode({ data, selected }: NodeProps<ConditionNode>) {
  const { node, executionStatus, result, onSelect, onAddTrue, onAddFalse } = data;
  const status = executionStatus ?? "idle";
  const config = node.config as { expression?: string };
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
          relative min-w-[200px] max-w-[260px] cursor-pointer transition-all duration-300
          rounded-lg border overflow-hidden
          ${status === "completed" ? "bg-alive/5 border-alive/40" : ""}
          ${status === "failed" ? "bg-critical/5 border-critical/40" : ""}
          ${status === "running" ? "bg-primary/5 border-primary/50" : ""}
          ${status === "idle" ? "bg-card border-border" : ""}
          ${selected && status === "idle" ? "ring-2 ring-primary shadow-lg" : ""}
        `}
        onClick={() => onSelect(node.id)}
      >
        <div className={`absolute inset-y-0 left-0 w-1 ${
          status === "completed" ? "bg-alive" :
          status === "failed" ? "bg-critical" :
          status === "running" ? "bg-primary animate-pulse" :
          "bg-orange-400"
        }`} />

        <div className="pl-4 pr-3 py-3">
          <div className="flex items-center gap-2.5">
            <div className={`shrink-0 size-8 rounded-md flex items-center justify-center ${status === "idle" ? "bg-orange-400/10" : ""}`}>
              {status === "running" ? (
                <Loader2 className="size-4 text-primary animate-spin" />
              ) : status === "completed" ? (
                <CheckCircle2 className="size-4 text-alive" />
              ) : status === "failed" ? (
                <XCircle className="size-4 text-critical" />
              ) : (
                <GitFork className="size-4 text-orange-400" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{node.name}</p>
              <p className="text-[11px] text-muted-foreground">Condition</p>
            </div>

            {result !== undefined && (
              <Badge variant="outline" className={`text-[9px] ${result ? "text-alive" : "text-critical"}`}>
                {result ? "TRUE" : "FALSE"}
              </Badge>
            )}
          </div>

          {config.expression && (
            <p className="mt-2 text-[10px] font-mono text-muted-foreground truncate pl-[42px]">
              if {config.expression}
            </p>
          )}
        </div>
      </div>

      {/* True handle — left (green) */}
      <Handle
        id="true"
        type="source"
        position={Position.Left}
        className="!w-3 !h-3 !bg-alive !border-2 !border-alive/30 !-left-1.5"
        style={{ top: "70%" }}
      />

      {/* False handle — right (red) */}
      <Handle
        id="false"
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-critical !border-2 !border-critical/30 !-right-1.5"
        style={{ top: "70%" }}
      />

      {/* + buttons for true/false branches — inside node DOM */}
      {!isExecuting && (onAddTrue || onAddFalse) && (
        <div className="flex justify-between mt-1 px-2 nopan nodrag">
          {onAddTrue ? (
            <AddStepMenu onAdd={onAddTrue}>
              <button
                type="button"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-alive/40 bg-card text-alive hover:bg-alive hover:text-white transition-colors text-[10px]"
              >
                <Plus className="size-2.5" /> true
              </button>
            </AddStepMenu>
          ) : <span />}
          {onAddFalse ? (
            <AddStepMenu onAdd={onAddFalse}>
              <button
                type="button"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-critical/40 bg-card text-critical hover:bg-critical hover:text-white transition-colors text-[10px]"
              >
                <Plus className="size-2.5" /> false
              </button>
            </AddStepMenu>
          ) : <span />}
        </div>
      )}
    </>
  );
}

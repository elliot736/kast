"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Play } from "lucide-react";
import type { NodeType } from "@/lib/api";
import { AddStepMenu } from "../add-step-menu";

export interface StartNodeData {
  hasEdge: boolean;
  onAddFromHandle: (type: NodeType) => void;
  [key: string]: unknown;
}

export type StartNode = Node<StartNodeData, "start">;

export function StartNode({ data }: NodeProps<StartNode>) {
  const { hasEdge, onAddFromHandle } = data;

  return (
    <div className="relative">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-alive/20 border-2 border-alive shadow-sm">
        <Play className="size-4 text-alive ml-0.5" />
      </div>
      <Handle
        id="default"
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-alive !border-none"
      />

      {/* + button below the node when no edge exists */}
      {!hasEdge && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
          <AddStepMenu onAdd={onAddFromHandle}>
            <button
              type="button"
              className="flex items-center justify-center w-5 h-5 rounded-full border bg-card text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors text-xs font-bold"
            >
              +
            </button>
          </AddStepMenu>
        </div>
      )}
    </div>
  );
}

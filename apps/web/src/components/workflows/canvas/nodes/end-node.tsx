"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Square } from "lucide-react";

export interface EndNodeData {
  [key: string]: unknown;
}

export type EndNode = Node<EndNodeData, "end">;

export function EndNode(_props: NodeProps<EndNode>) {
  return (
    <>
      <Handle
        id="input"
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-critical !border-none"
      />
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-critical/20 border-2 border-critical shadow-sm">
        <Square className="size-3.5 text-critical" />
      </div>
    </>
  );
}

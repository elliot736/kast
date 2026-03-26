"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { WorkflowGraph, WorkflowStepResult } from "@/lib/api";
import { BaseNode, type StepNodeData, type StepExecutionStatus } from "./nodes/base-node";
import { ConditionNode, type ConditionNodeData } from "./nodes/condition-node";

const nodeTypes: NodeTypes = {
  step: BaseNode,
  condition: ConditionNode,
};

export function ExecutionCanvas({
  graph,
  stepResults,
  currentStepId,
  workflowStatus,
}: {
  graph: WorkflowGraph;
  stepResults: WorkflowStepResult[];
  currentStepId: string | null;
  workflowStatus: string;
}) {
  const resultMap = useMemo(
    () => new Map(stepResults.map((r) => [r.stepId, r])),
    [stepResults],
  );

  const getStatus = (nodeId: string): StepExecutionStatus => {
    const result = resultMap.get(nodeId);
    if (result) {
      if (result.status === "completed") return "completed";
      if (result.status === "failed") return "failed";
      if (result.status === "skipped") return "skipped";
    }
    if (nodeId === currentStepId) {
      if (workflowStatus === "sleeping") return "sleeping";
      if (workflowStatus === "waiting") return "waiting";
      if (workflowStatus === "running") return "running";
    }
    return "idle";
  };

  const realNodes = useMemo(() => graph.nodes.filter((n) => (n.type as string) !== "start" && (n.type as string) !== "end"), [graph.nodes]);
  const realNodeIds = useMemo(() => new Set(realNodes.map((n) => n.id)), [realNodes]);

  const nodes = useMemo<Node[]>(
    () =>
      realNodes.map((node) => {
        if (node.type === "condition") {
          const condResult = resultMap.get(node.id)?.output as { result?: boolean } | undefined;
          return {
            id: node.id, type: "condition", position: node.position ?? { x: 250, y: 200 }, draggable: false,
            data: {
              node, executionStatus: getStatus(node.id), result: condResult?.result,
              onSelect: () => {},
            } satisfies ConditionNodeData,
          };
        }
        return {
          id: node.id, type: "step", position: node.position ?? { x: 250, y: 200 }, draggable: false,
          data: {
            node, executionStatus: getStatus(node.id),
            durationMs: resultMap.get(node.id)?.durationMs ?? undefined,
            onSelect: () => {}, onDelete: () => {},
          } satisfies StepNodeData,
        };
      }),
    [realNodes, stepResults, currentStepId, workflowStatus],
  );

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.filter((e) => realNodeIds.has(e.source) && realNodeIds.has(e.target)).map((edge) => {
        const sourceCompleted = resultMap.get(edge.source)?.status === "completed";
        const isConditionEdge = edge.sourceHandle === "true" || edge.sourceHandle === "false";
        const isLoop = !!edge.loop;

        let stroke = "var(--color-muted-foreground)";
        let strokeWidth = 1.5;
        let strokeDasharray: string | undefined;

        if (sourceCompleted) { stroke = "var(--color-alive)"; strokeWidth = 2; }
        else if (isLoop) { stroke = "#22d3ee"; strokeDasharray = "6 3"; }
        else if (isConditionEdge) {
          stroke = edge.sourceHandle === "true" ? "var(--color-alive)" : "var(--color-critical)";
          strokeDasharray = "6 3";
        }

        return {
          id: edge.id,
          source: edge.source,
          sourceHandle: edge.sourceHandle ?? "default",
          target: edge.target,
          targetHandle: "input",
          animated: !!sourceCompleted,
          label: edge.label ?? (isConditionEdge ? edge.sourceHandle : undefined) ?? (isLoop ? "loop" : undefined),
          style: { stroke, strokeWidth, strokeDasharray },
        };
      }),
    [graph.edges, stepResults],
  );

  return (
    <div className="w-full rounded-lg border bg-card overflow-hidden" style={{ height: Math.max(400, graph.nodes.length * 100 + 150) }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        fitView
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background gap={20} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-card !border !border-border !rounded-lg !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent"
        />
      </ReactFlow>
    </div>
  );
}

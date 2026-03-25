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

import type { WorkflowStepDefinition, WorkflowStepResult } from "@/lib/api";
import { BaseNode, type StepNodeData, type StepExecutionStatus } from "./nodes/base-node";

const NODE_SPACING_Y = 120;
const NODE_CENTER_X = 250;

const nodeTypes: NodeTypes = {
  step: BaseNode,
};

function getStepStatus(
  stepIndex: number,
  currentStepIndex: number | null,
  workflowStatus: string,
  stepResults: WorkflowStepResult[],
): StepExecutionStatus {
  const result = stepResults.find((r) => r.stepIndex === stepIndex);

  if (result) {
    if (result.status === "completed") return "completed";
    if (result.status === "failed") return "failed";
    if (result.status === "skipped") return "skipped";
  }

  if (stepIndex === currentStepIndex) {
    if (workflowStatus === "sleeping") return "sleeping";
    if (workflowStatus === "waiting") return "waiting";
    if (workflowStatus === "running") return "running";
  }

  return "idle";
}

export function ExecutionCanvas({
  steps,
  stepResults,
  currentStepIndex,
  workflowStatus,
}: {
  steps: WorkflowStepDefinition[];
  stepResults: WorkflowStepResult[];
  currentStepIndex: number | null;
  workflowStatus: string;
}) {
  const nodes = useMemo<Node<StepNodeData>[]>(
    () =>
      steps.map((step, i) => {
        const result = stepResults.find((r) => r.stepIndex === i);
        return {
          id: step.id,
          type: "step",
          position: { x: NODE_CENTER_X, y: i * NODE_SPACING_Y },
          draggable: false,
          data: {
            step,
            index: i,
            executionStatus: getStepStatus(i, currentStepIndex, workflowStatus, stepResults),
            durationMs: result?.durationMs ?? undefined,
            onSelect: () => {},
            onDelete: () => {},
          },
        };
      }),
    [steps, stepResults, currentStepIndex, workflowStatus],
  );

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];
    for (let i = 0; i < steps.length - 1; i++) {
      const sourceResult = stepResults.find((r) => r.stepIndex === i);
      const isCompleted = sourceResult?.status === "completed";
      result.push({
        id: `e-${steps[i].id}-${steps[i + 1].id}`,
        source: steps[i].id,
        target: steps[i + 1].id,
        animated: isCompleted,
        style: {
          stroke: isCompleted
            ? "var(--color-alive)"
            : "var(--color-muted-foreground)",
          strokeWidth: isCompleted ? 2 : 1.5,
        },
      });
    }
    return result;
  }, [steps, stepResults]);

  const canvasHeight = Math.max(350, steps.length * NODE_SPACING_Y + 100);

  return (
    <div className="w-full rounded-lg border bg-card overflow-hidden" style={{ height: canvasHeight }}>
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
        minZoom={0.5}
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

"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type OnNodesChange,
  applyNodeChanges,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import type { WorkflowStepDefinition, WorkflowStepResult } from "@/lib/api";
import { Save } from "lucide-react";

import { BaseNode, type StepNodeData, type StepExecutionStatus } from "./nodes/base-node";
import { AddStepMenu, InsertStepButton } from "./add-step-menu";
import { StepConfigPanel } from "./step-config-panel";

// ── Constants ───────────────────────────────────────────────

const NODE_SPACING_Y = 120;
const NODE_CENTER_X = 250;

// ── Default configs per step type ───────────────────────────

function getDefaultConfig(
  type: WorkflowStepDefinition["type"]
): Record<string, unknown> {
  switch (type) {
    case "run":
      return { url: "", method: "POST" };
    case "sleep":
      return { duration: "PT30S" };
    case "spawn":
      return { targetJobId: "", wait: false };
    case "signal_parent":
      return { payload: {} };
    case "signal_child":
      return { spawnStepId: "", payload: {} };
    case "wait_for_signal":
      return { timeoutDuration: "" };
    case "fan_out":
      return {
        branches: [
          {
            id: "branch-1",
            name: "Branch 1",
            config: { url: "", method: "POST" },
          },
        ],
      };
    default:
      return {};
  }
}

// ── Helpers ─────────────────────────────────────────────────

let stepCounter = 0;

function createStep(
  type: WorkflowStepDefinition["type"],
  index: number
): WorkflowStepDefinition {
  stepCounter++;
  return {
    id: `step-${Date.now()}-${stepCounter}`,
    name: `Step ${index + 1}`,
    type,
    config: getDefaultConfig(type),
  };
}

function stepsToNodes(
  steps: WorkflowStepDefinition[],
  onSelect: (id: string) => void,
  onDelete: (id: string) => void,
  execution?: {
    stepResults: WorkflowStepResult[];
    currentStepIndex: number | null;
    workflowStatus: string;
  },
): Node<StepNodeData>[] {
  return steps.map((step, i) => {
    const result = execution?.stepResults.find((r) => r.stepIndex === i);
    return {
      id: step.id,
      type: "step",
      position: { x: NODE_CENTER_X, y: i * NODE_SPACING_Y },
      data: {
        step,
        index: i,
        onSelect,
        onDelete,
        executionStatus: execution
          ? getStepExecStatus(i, execution.currentStepIndex, execution.workflowStatus, execution.stepResults)
          : undefined,
        durationMs: result?.durationMs ?? undefined,
      },
    };
  });
}

function stepsToEdges(
  steps: WorkflowStepDefinition[],
  execution?: { stepResults: WorkflowStepResult[] },
): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    const sourceCompleted = execution?.stepResults.some(
      (r) => r.stepIndex === i && r.status === "completed",
    );
    edges.push({
      id: `e-${steps[i].id}-${steps[i + 1].id}`,
      source: steps[i].id,
      target: steps[i + 1].id,
      type: "default",
      animated: !!sourceCompleted,
      style: {
        stroke: sourceCompleted ? "var(--color-alive)" : "var(--color-muted-foreground)",
        strokeWidth: sourceCompleted ? 2 : 1.5,
      },
    });
  }
  return edges;
}

// ── Node types registry ─────────────────────────────────────

const nodeTypes: NodeTypes = {
  step: BaseNode,
};

// ── Main component ──────────────────────────────────────────

function getStepExecStatus(
  stepIndex: number,
  currentStepIndex: number | null,
  workflowStatus: string | null,
  stepResults: WorkflowStepResult[],
): StepExecutionStatus {
  const result = stepResults.find((r) => r.stepIndex === stepIndex);
  if (result) {
    if (result.status === "completed") return "completed";
    if (result.status === "failed") return "failed";
    if (result.status === "skipped") return "skipped";
  }
  if (stepIndex === currentStepIndex && workflowStatus) {
    if (workflowStatus === "sleeping") return "sleeping";
    if (workflowStatus === "waiting") return "waiting";
    if (workflowStatus === "running") return "running";
  }
  return "idle";
}

export function WorkflowCanvas({
  steps: initialSteps,
  onSave,
  saving,
  execution,
}: {
  steps: WorkflowStepDefinition[];
  onSave: (steps: WorkflowStepDefinition[]) => void;
  saving: boolean;
  execution?: {
    stepResults: WorkflowStepResult[];
    currentStepIndex: number | null;
    workflowStatus: string;
  };
}) {
  const [steps, setSteps] = useState<WorkflowStepDefinition[]>(initialSteps);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  // ── Callbacks ───────────────────────────────────────────

  const handleSelect = useCallback((id: string) => {
    setSelectedStepId(id);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      setSteps((prev) => prev.filter((s) => s.id !== id));
      if (selectedStepId === id) setSelectedStepId(null);
    },
    [selectedStepId]
  );

  const handleAddStep = useCallback(
    (type: WorkflowStepDefinition["type"], atIndex?: number) => {
      setSteps((prev) => {
        const insertAt = atIndex ?? prev.length;
        const newStep = createStep(type, insertAt);
        const next = [...prev];
        next.splice(insertAt, 0, newStep);
        return next;
      });
    },
    []
  );

  const handleUpdateStep = useCallback(
    (updated: WorkflowStepDefinition) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
    },
    []
  );

  // ── Derive nodes and edges ────────────────────────────

  const nodes = useMemo(
    () => stepsToNodes(steps, handleSelect, handleDelete, execution),
    [steps, handleSelect, handleDelete, execution]
  );

  const edges = useMemo(() => stepsToEdges(steps, execution), [steps, execution]);

  // ── Track node position changes for reorder ───────────

  const [internalNodes, setInternalNodes] = useState<Node<StepNodeData>[]>(nodes);

  // Sync when steps change (add/delete/update) or execution data changes
  const stepIds = steps.map((s) => s.id).join(",");
  const execKey = execution
    ? `${execution.workflowStatus}-${execution.stepResults.length}-${execution.currentStepIndex}`
    : "none";
  const syncKey = `${stepIds}|${execKey}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    setInternalNodes(nodes);
  }

  const onNodesChange: OnNodesChange<Node<StepNodeData>> = useCallback(
    (changes) => {
      setInternalNodes((nds) => applyNodeChanges(changes, nds));
    },
    []
  );

  // Reorder steps when a drag ends (based on y positions)
  const handleNodeDragStop = useCallback(() => {
    setInternalNodes((currentNodes) => {
      // Sort by y position to determine new order
      const sorted = [...currentNodes].sort(
        (a, b) => a.position.y - b.position.y
      );
      const newOrder = sorted.map((n) => n.id);
      const currentOrder = steps.map((s) => s.id);

      // Only reorder if order actually changed
      if (newOrder.join(",") !== currentOrder.join(",")) {
        const stepMap = new Map(steps.map((s) => [s.id, s]));
        const reordered = newOrder
          .map((id) => stepMap.get(id))
          .filter(Boolean) as WorkflowStepDefinition[];
        setSteps(reordered);
      }

      return currentNodes;
    });
  }, [steps]);

  // ── Selected step ─────────────────────────────────────

  const selectedStep = selectedStepId
    ? steps.find((s) => s.id === selectedStepId) ?? null
    : null;

  return (
    <div className="relative w-full" style={{ height: Math.max(400, steps.length * NODE_SPACING_Y + 150) }}>
      <ReactFlow
        nodes={internalNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        nodesDraggable
        nodesConnectable={false}
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

      {/* Insert step buttons between nodes */}
      <div className="absolute left-0 top-0 pointer-events-none w-full h-full">
        {/* We overlay the + buttons using a portal-like approach at calculated positions.
            For simplicity, these are rendered as a floating column. */}
      </div>

      {/* Floating bottom toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-lg border bg-card p-2 shadow-lg">
        <AddStepMenu onAdd={(type) => handleAddStep(type)} />

        {steps.length > 0 && (
          <>
            {/* Insert buttons for each gap */}
            <div className="h-5 w-px bg-border" />
            {steps.map((step, i) =>
              i < steps.length - 1 ? (
                <InsertStepButton
                  key={`insert-${step.id}`}
                  onAdd={(type) => handleAddStep(type, i + 1)}
                />
              ) : null
            )}
            {steps.length > 1 && <div className="h-5 w-px bg-border" />}
          </>
        )}

        <Button
          size="sm"
          onClick={() => onSave(steps)}
          disabled={saving || steps.length === 0}
        >
          <Save className="size-3.5" />
          {saving ? "Saving..." : "Save Workflow"}
        </Button>
      </div>

      {/* Side panel */}
      {selectedStep && (
        <StepConfigPanel
          step={selectedStep}
          onChange={handleUpdateStep}
          onDelete={() => handleDelete(selectedStep.id)}
          onClose={() => setSelectedStepId(null)}
        />
      )}
    </div>
  );
}

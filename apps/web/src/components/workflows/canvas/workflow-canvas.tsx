"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import type {
  WorkflowGraph,
  WorkflowNodeDefinition,
  WorkflowEdgeDefinition,
  WorkflowStepResult,
  NodeType,
} from "@/lib/api";
import { Save } from "lucide-react";

import { BaseNode, type StepNodeData, type StepExecutionStatus } from "./nodes/base-node";
import { ConditionNode, type ConditionNodeData } from "./nodes/condition-node";
import { AddStepMenu } from "./add-step-menu";
import { StepConfigPanel } from "./step-config-panel";

// ── Helpers ─────────────────────────────────────────────────

let nodeCounter = 0;

function createNode(type: NodeType, position: { x: number; y: number }): WorkflowNodeDefinition {
  nodeCounter++;
  const id = `${type}-${Date.now()}-${nodeCounter}`;
  const configs: Record<string, Record<string, unknown>> = {
    run: { url: "", method: "POST" },
    sleep: { duration: "PT30S" },
    condition: { expression: "" },
    run_job: { targetJobId: "", mode: "fire_and_forget" },
    fan_out: { concurrency: undefined, failFast: false },
    webhook_wait: { timeoutDuration: undefined },
  };
  return {
    id,
    name: `New ${type}`,
    type,
    config: configs[type] ?? {},
    position,
  };
}

// ── Node types registry ─────────────────────────────────────

const nodeTypes: NodeTypes = {
  step: BaseNode,
  condition: ConditionNode,
};

// ── Convert graph → React Flow ──────────────────────────────

function graphToFlowNodes(
  graph: WorkflowGraph,
  callbacks: {
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    onAddFromHandle: (sourceId: string, sourceHandle: string, type: NodeType) => void;
  },
  execution?: {
    stepResults: WorkflowStepResult[];
    currentStepId: string | null;
    workflowStatus: string;
  },
): Node[] {
  const { onSelect, onDelete, onAddFromHandle } = callbacks;

  return graph.nodes
    .filter((n) => (n.type as string) !== "start" && (n.type as string) !== "end")
    .map((node) => {
      const result = execution?.stepResults.find((r) => r.stepId === node.id);
      let execStatus: StepExecutionStatus = "idle";
      if (result) {
        if (result.status === "completed") execStatus = "completed";
        else if (result.status === "failed") execStatus = "failed";
        else if (result.status === "skipped") execStatus = "skipped";
      } else if (execution?.currentStepId === node.id) {
        if (execution.workflowStatus === "sleeping") execStatus = "sleeping";
        else if (execution.workflowStatus === "waiting") execStatus = "waiting";
        else if (execution.workflowStatus === "running") execStatus = "running";
      }

      if (node.type === "condition") {
        const condResult = result?.output as { result?: boolean } | undefined;
        const hasTrueEdge = graph.edges.some((e) => e.source === node.id && e.sourceHandle === "true");
        const hasFalseEdge = graph.edges.some((e) => e.source === node.id && e.sourceHandle === "false");
        return {
          id: node.id,
          type: "condition",
          position: node.position ?? { x: 250, y: 200 },
          data: {
            node,
            executionStatus: execStatus,
            result: condResult?.result,
            onSelect,
            onAddTrue: !hasTrueEdge ? (type: NodeType) => onAddFromHandle(node.id, "true", type) : undefined,
            onAddFalse: !hasFalseEdge ? (type: NodeType) => onAddFromHandle(node.id, "false", type) : undefined,
          } satisfies ConditionNodeData,
        };
      }

      return {
        id: node.id,
        type: "step",
        position: node.position ?? { x: 250, y: 200 },
        data: {
          node,
          executionStatus: execStatus,
          durationMs: result?.durationMs ?? undefined,
          onSelect,
          onDelete,
          onAddFromHandle: (type: NodeType) => onAddFromHandle(node.id, "default", type),
        } satisfies StepNodeData,
      };
    });
}

function graphToFlowEdges(
  graph: WorkflowGraph,
  execution?: { stepResults: WorkflowStepResult[] },
): Edge[] {
  const realNodeIds = new Set(graph.nodes.filter((n) => (n.type as string) !== "start" && (n.type as string) !== "end").map((n) => n.id));

  return graph.edges
    .filter((e) => realNodeIds.has(e.source) && realNodeIds.has(e.target))
    .map((edge) => {
      const sourceCompleted = execution?.stepResults.some(
        (r) => r.stepId === edge.source && r.status === "completed",
      );
      const isLoop = !!edge.loop;
      const isConditionEdge = edge.sourceHandle === "true" || edge.sourceHandle === "false";

      let stroke = "var(--color-muted-foreground)";
      let strokeWidth = 1.5;
      let strokeDasharray: string | undefined;
      let animated = false;
      let label: string | undefined = edge.label;

      if (sourceCompleted) {
        stroke = "var(--color-alive)";
        strokeWidth = 2;
        animated = true;
      } else if (isLoop) {
        stroke = "#22d3ee";
        strokeDasharray = "6 3";
        label = label ?? "loop";
      } else if (isConditionEdge) {
        stroke = edge.sourceHandle === "true" ? "var(--color-alive)" : "var(--color-critical)";
        strokeDasharray = "6 3";
        label = label ?? edge.sourceHandle;
      }

      return {
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle ?? "default",
        target: edge.target,
        targetHandle: "input",
        type: "default",
        animated,
        label,
        style: { stroke, strokeWidth, strokeDasharray },
        data: { loop: edge.loop },
      };
    });
}

// ── Inner canvas (needs ReactFlowProvider) ──────────────────

function WorkflowCanvasInner({
  initialNodes,
  initialEdges,
  onSave,
  saving,
  execution,
}: {
  initialNodes: WorkflowNodeDefinition[];
  initialEdges: WorkflowEdgeDefinition[];
  onSave: (graph: WorkflowGraph) => void;
  saving: boolean;
  execution?: {
    stepResults: WorkflowStepResult[];
    currentStepId: string | null;
    workflowStatus: string;
  };
}) {
  const { screenToFlowPosition } = useReactFlow();

  const [graphNodes, setGraphNodes] = useState<WorkflowNodeDefinition[]>(initialNodes);
  const [graphEdges, setGraphEdges] = useState<WorkflowEdgeDefinition[]>(initialEdges);
  const graphEdgesRef = useRef(graphEdges);
  graphEdgesRef.current = graphEdges;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Track pending connection for drop-on-empty
  const pendingConnection = useRef<{ source: string; sourceHandle: string } | null>(null);
  const [dropMenuPos, setDropMenuPos] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);

  const handleSelect = useCallback((id: string) => setSelectedNodeId(id), []);

  const handleDelete = useCallback(
    (id: string) => {
      setGraphNodes((prev) => prev.filter((n) => n.id !== id));
      setGraphEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
      if (selectedNodeId === id) setSelectedNodeId(null);
    },
    [selectedNodeId],
  );

  const handleUpdateNode = useCallback((updated: WorkflowNodeDefinition) => {
    setGraphNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }, []);

  // ── Centralized edge creation with validation ──────────────

  const canAddFromHandle = useCallback((source: string, sourceHandle: string): boolean => {
    const edges = graphEdgesRef.current;
    // Condition handles: only one edge allowed
    if ((sourceHandle === "true" || sourceHandle === "false") &&
        edges.some((e) => e.source === source && e.sourceHandle === sourceHandle)) return false;
    return true;
  }, []);

  const doAddEdge = useCallback((source: string, sourceHandle: string, target: string) => {
    const edgeId = `e-${source}-${sourceHandle}-${target}`;
    setGraphEdges((prev) => [...prev, { id: edgeId, source, sourceHandle, target }]);
  }, []);

  // ── Add from node's + button ──────────────────────────────

  const handleAddFromHandle = useCallback(
    (sourceId: string, sourceHandle: string, type: NodeType) => {
      setGraphNodes((prevNodes) => {
        const sourceNode = prevNodes.find((n) => n.id === sourceId);
        if (!sourceNode) return prevNodes;
        const sourcePos = sourceNode.position ?? { x: 250, y: 0 };
        let newPos: { x: number; y: number };
        if (sourceHandle === "true") {
          newPos = { x: sourcePos.x - 200, y: sourcePos.y + 140 };
        } else if (sourceHandle === "false") {
          newPos = { x: sourcePos.x + 200, y: sourcePos.y + 140 };
        } else {
          newPos = { x: sourcePos.x, y: sourcePos.y + 140 };
        }
        // Check before creating — don't create orphan if handle is already taken
        if (!canAddFromHandle(sourceId, sourceHandle)) return prevNodes;
        const newNode = createNode(type, newPos);
        setTimeout(() => doAddEdge(sourceId, sourceHandle, newNode.id), 0);
        return [...prevNodes, newNode];
      });
    },
    [canAddFromHandle, doAddEdge],
  );

  // ── React Flow derivation ────────────────────────────────

  const flowNodes = useMemo(
    () => graphToFlowNodes(
      { nodes: graphNodes, edges: graphEdges },
      { onSelect: handleSelect, onDelete: handleDelete, onAddFromHandle: handleAddFromHandle },
      execution,
    ),
    [graphNodes, graphEdges, handleSelect, handleDelete, handleAddFromHandle, execution],
  );

  const flowEdges = useMemo(
    () => graphToFlowEdges({ nodes: graphNodes, edges: graphEdges }, execution),
    [graphNodes, graphEdges, execution],
  );

  const [rfNodes, setRfNodes] = useState<Node[]>(flowNodes);
  const [rfEdges, setRfEdges] = useState<Edge[]>(flowEdges);

  const graphKey = `${graphNodes.map((n) => n.id).join(",")}|${graphEdges.map((e) => e.id).join(",")}`;
  const execKey = execution
    ? `${execution.workflowStatus}-${execution.stepResults.length}-${execution.currentStepId}`
    : "none";
  const syncKey = `${graphKey}|${execKey}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    setRfNodes(flowNodes);
    setRfEdges(flowEdges);
  }

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setRfNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setRfEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  // ── Edge creation: drop on node ──────────────────────────

  const onConnect = useCallback((connection: Connection) => {
    const source = connection.source!;
    const sourceHandle = connection.sourceHandle ?? "default";
    const target = connection.target!;
    if (source === target) return;
    if (!canAddFromHandle(source, sourceHandle)) return;
    doAddEdge(source, sourceHandle, target);
  }, [canAddFromHandle, doAddEdge]);

  // ── Edge creation: drop on empty space → show menu ───────

  const onConnectStart = useCallback((_: any, params: { nodeId: string | null; handleId: string | null }) => {
    pendingConnection.current = params.nodeId
      ? { source: params.nodeId, sourceHandle: params.handleId ?? "default" }
      : null;
  }, []);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    if (!pendingConnection.current) return;

    // Check if we dropped on a node (onConnect would have fired) or on empty space
    const target = (event as MouseEvent).target as HTMLElement;
    const isOnNode = target.closest(".react-flow__node");
    if (isOnNode) {
      pendingConnection.current = null;
      return;
    }

    // Dropped on empty space — show the add menu at this position
    const clientX = "clientX" in event ? event.clientX : (event as TouchEvent).touches[0].clientX;
    const clientY = "clientY" in event ? event.clientY : (event as TouchEvent).touches[0].clientY;

    const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
    setDropMenuPos({ x: clientX, y: clientY, flowX: flowPos.x, flowY: flowPos.y });
  }, [screenToFlowPosition]);

  const handleDropMenuSelect = useCallback((type: NodeType) => {
    if (!pendingConnection.current || !dropMenuPos) return;

    const { source, sourceHandle } = pendingConnection.current;
    if (!canAddFromHandle(source, sourceHandle)) {
      pendingConnection.current = null;
      setDropMenuPos(null);
      return;
    }

    const newNode = createNode(type, { x: dropMenuPos.flowX - 120, y: dropMenuPos.flowY - 30 });
    setGraphNodes((prev) => [...prev, newNode]);
    setTimeout(() => doAddEdge(source, sourceHandle, newNode.id), 0);

    pendingConnection.current = null;
    setDropMenuPos(null);
  }, [dropMenuPos, canAddFromHandle, doAddEdge]);

  const handleDropMenuClose = useCallback(() => {
    pendingConnection.current = null;
    setDropMenuPos(null);
  }, []);

  // ── Other handlers ────────────────────────────────────────

  const handleNodeDragStop = useCallback((_event: any, rfNode: Node) => {
    setGraphNodes((prev) => prev.map((n) => n.id === rfNode.id ? { ...n, position: rfNode.position } : n));
  }, []);

  const onEdgesDelete = useCallback((deletedEdges: Edge[]) => {
    const ids = new Set(deletedEdges.map((e) => e.id));
    setGraphEdges((prev) => prev.filter((e) => !ids.has(e.id)));
  }, []);

  const selectedNode = selectedNodeId ? graphNodes.find((n) => n.id === selectedNodeId) ?? null : null;

  const handleSave = useCallback(() => {
    const positionMap = new Map(rfNodes.map((n) => [n.id, n.position]));
    const nodesWithPositions = graphNodes.map((n) => ({
      ...n,
      position: positionMap.get(n.id) ?? n.position,
    }));
    onSave({ nodes: nodesWithPositions, edges: graphEdges });
  }, [graphNodes, graphEdges, rfNodes, onSave]);

  return (
    <div className="relative w-full" style={{ height: Math.max(400, graphNodes.length * 120 + 150) }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeDragStop={handleNodeDragStop}
        onEdgesDelete={onEdgesDelete}
        nodeTypes={nodeTypes}
        nodesDraggable
        nodesConnectable
        fitView
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
        defaultEdgeOptions={{
          type: "default",
          style: { stroke: "var(--color-muted-foreground)", strokeWidth: 1.5 },
        }}
      >
        <Background gap={20} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-card !border !border-border !rounded-lg !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent"
        />
      </ReactFlow>

      {/* Drop-on-empty menu */}
      {dropMenuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={handleDropMenuClose} />
          <div
            className="fixed z-50"
            style={{ left: dropMenuPos.x, top: dropMenuPos.y }}
          >
            <AddStepMenu onAdd={handleDropMenuSelect} defaultOpen onClose={handleDropMenuClose} />
          </div>
        </>
      )}

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-lg border bg-card p-2 shadow-lg">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="size-3.5" />
          {saving ? "Saving..." : "Save Workflow"}
        </Button>
      </div>

      {selectedNode && (
        <StepConfigPanel
          node={selectedNode}
          onChange={handleUpdateNode}
          onDelete={() => handleDelete(selectedNode.id)}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────

export function WorkflowCanvas({
  graph: initialGraph,
  onSave,
  saving,
  execution,
}: {
  graph: WorkflowGraph;
  onSave: (graph: WorkflowGraph) => void;
  saving: boolean;
  execution?: {
    stepResults: WorkflowStepResult[];
    currentStepId: string | null;
    workflowStatus: string;
  };
}) {
  const initialNodes = initialGraph.nodes.filter((n) => (n.type as string) !== "start" && (n.type as string) !== "end");
  const realIds = new Set(initialNodes.map((n) => n.id));
  const initialEdges = initialGraph.edges.filter((e) => realIds.has(e.source) && realIds.has(e.target));

  // ── Empty state ──────────────────────────────────────────

  const [firstNode, setFirstNode] = useState<WorkflowNodeDefinition | null>(null);

  if (initialNodes.length === 0 && !firstNode) {
    return (
      <div className="relative w-full flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-card/50" style={{ height: 300 }}>
        <p className="text-sm text-muted-foreground">No workflow steps yet</p>
        <AddStepMenu onAdd={(type) => setFirstNode(createNode(type, { x: 250, y: 100 }))}>
          <button
            type="button"
            className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary transition-colors text-2xl"
          >
            +
          </button>
        </AddStepMenu>
        <p className="text-xs text-muted-foreground">Click to add your first step</p>
      </div>
    );
  }

  const nodes = firstNode ? [firstNode, ...initialNodes] : initialNodes;

  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner
        initialNodes={nodes}
        initialEdges={initialEdges}
        onSave={onSave}
        saving={saving}
        execution={execution}
      />
    </ReactFlowProvider>
  );
}

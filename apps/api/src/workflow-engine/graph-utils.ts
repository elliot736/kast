import type { WorkflowGraph, WorkflowEdgeDefinition, WorkflowNodeDefinition, NodeType } from '../workflow/workflow.types';

// ── Adjacency ───────────────────────────────────────────────

export interface AdjacencyEntry {
  node: WorkflowNodeDefinition;
  outgoing: WorkflowEdgeDefinition[];
  incoming: WorkflowEdgeDefinition[];
}

export type AdjacencyMap = Map<string, AdjacencyEntry>;

export function buildAdjacency(graph: WorkflowGraph): AdjacencyMap {
  const map: AdjacencyMap = new Map();

  for (const node of graph.nodes) {
    map.set(node.id, { node, outgoing: [], incoming: [] });
  }

  for (const edge of graph.edges) {
    map.get(edge.source)?.outgoing.push(edge);
    map.get(edge.target)?.incoming.push(edge);
  }

  return map;
}

// ── Topological sort (Kahn's algorithm, ignoring back-edges) ─

export function topologicalSort(graph: WorkflowGraph): string[] {
  const adj = buildAdjacency(graph);
  const inDegree = new Map<string, number>();

  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
  }

  for (const edge of graph.edges) {
    if (edge.loop) continue; // ignore back-edges
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    sorted.push(nodeId);

    const entry = adj.get(nodeId);
    if (!entry) continue;

    for (const edge of entry.outgoing) {
      if (edge.loop) continue;
      const targetDeg = (inDegree.get(edge.target) ?? 1) - 1;
      inDegree.set(edge.target, targetDeg);
      if (targetDeg === 0) queue.push(edge.target);
    }
  }

  return sorted;
}

// ── Frontier computation ────────────────────────────────────

/**
 * Compute the execution frontier: nodes that are ready to execute.
 * A node is ready when:
 * 1. It has no step result yet
 * 2. All incoming non-loop edges have their source node completed
 * 3. For condition source edges: only the edge matching the condition output counts
 */
export function computeFrontier(
  graph: WorkflowGraph,
  adjacency: AdjacencyMap,
  completedNodeIds: Set<string>,
  conditionResults: Map<string, boolean>, // nodeId → true/false
): string[] {
  const frontier: string[] = [];

  for (const node of graph.nodes) {
    if (completedNodeIds.has(node.id)) continue;

    const entry = adjacency.get(node.id);
    if (!entry) continue;

    // Filter to non-loop incoming edges
    const incomingEdges = entry.incoming.filter((e) => !e.loop);

    // Node with no incoming non-loop edges is an entry point — always ready if not completed
    if (incomingEdges.length === 0) {
      frontier.push(node.id);
      continue;
    }

    // Check if all incoming edges are satisfied
    const allSatisfied = incomingEdges.every((edge) => {
      const sourceEntry = adjacency.get(edge.source);
      if (!sourceEntry) return false;

      // Source must be completed
      if (!completedNodeIds.has(edge.source)) return false;

      // If source is a condition node, only the matching handle's edge counts
      if (sourceEntry.node.type === 'condition') {
        const condResult = conditionResults.get(edge.source);
        if (condResult === undefined) return false;
        const expectedHandle = condResult ? 'true' : 'false';
        // This edge is only "active" if its sourceHandle matches the condition result
        if (edge.sourceHandle && edge.sourceHandle !== expectedHandle) return false;
      }

      return true;
    });

    if (allSatisfied) {
      frontier.push(node.id);
    }
  }

  return frontier;
}

// ── Loop body detection ─────────────────────────────────────

/**
 * Get all node IDs in a loop body (between the loop target and the loop source).
 * Uses the topological order to determine which nodes are "between" them.
 */
export function getLoopBodyNodes(
  graph: WorkflowGraph,
  loopEdge: WorkflowEdgeDefinition,
): Set<string> {
  const topoOrder = topologicalSort(graph);
  const targetIdx = topoOrder.indexOf(loopEdge.target);
  const sourceIdx = topoOrder.indexOf(loopEdge.source);

  if (targetIdx < 0 || sourceIdx < 0 || targetIdx > sourceIdx) {
    return new Set();
  }

  return new Set(topoOrder.slice(targetIdx, sourceIdx + 1));
}

// ── Validation ──────────────────────────────────────────────

export interface GraphValidationError {
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export function validateGraph(graph: WorkflowGraph): GraphValidationError[] {
  const errors: GraphValidationError[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  // Must have at least one node
  if (graph.nodes.length === 0) {
    errors.push({ message: 'Workflow must have at least one node' });
  }

  // Must have exactly one entry point (node with no incoming non-loop edges)
  const nodesWithIncoming = new Set(graph.edges.filter((e) => !e.loop).map((e) => e.target));
  const entryNodes = graph.nodes.filter((n) => !nodesWithIncoming.has(n.id));
  if (entryNodes.length === 0 && graph.nodes.length > 0) {
    errors.push({ message: 'Workflow has no entry point (all nodes have incoming edges)' });
  } else if (entryNodes.length > 1) {
    errors.push({ message: `Workflow has multiple entry points: ${entryNodes.map((n) => n.id).join(', ')}` });
  }

  // All edges must reference existing nodes
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({ message: `Edge references unknown source "${edge.source}"`, edgeId: edge.id });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({ message: `Edge references unknown target "${edge.target}"`, edgeId: edge.id });
    }
    if (edge.source === edge.target) {
      errors.push({ message: `Self-loop on node "${edge.source}"`, edgeId: edge.id });
    }
  }

  // Check for cycles (excluding loop back-edges)
  const sorted = topologicalSort(graph);
  if (sorted.length < graph.nodes.length) {
    const inSort = new Set(sorted);
    const cycleNodes = graph.nodes.filter((n) => !inSort.has(n.id));
    errors.push({
      message: `Cycle detected involving nodes: ${cycleNodes.map((n) => n.id).join(', ')}`,
    });
  }

  // Condition nodes should have exactly 2 outgoing edges (true + false)
  const adj = buildAdjacency(graph);
  for (const node of graph.nodes) {
    if (node.type === 'condition') {
      const outgoing = adj.get(node.id)?.outgoing.filter((e) => !e.loop) ?? [];
      const handles = new Set(outgoing.map((e) => e.sourceHandle));
      if (!handles.has('true') || !handles.has('false')) {
        errors.push({
          message: `Condition node "${node.id}" must have both "true" and "false" outgoing edges`,
          nodeId: node.id,
        });
      }
    }
  }

  // All nodes must be reachable from entry point
  if (entryNodes.length === 1) {
    const reachable = new Set<string>();
    const visit = [entryNodes[0].id];
    while (visit.length > 0) {
      const id = visit.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const entry = adj.get(id);
      if (entry) {
        for (const edge of entry.outgoing) {
          visit.push(edge.target);
        }
      }
    }
    for (const node of graph.nodes) {
      if (!reachable.has(node.id)) {
        errors.push({ message: `Node "${node.id}" is not reachable from start`, nodeId: node.id });
      }
    }
  }

  return errors;
}

// ── Format detection ────────────────────────────────────────

/**
 * Check if a workflow's steps column contains the new graph format or the legacy array format.
 */
export function isGraphFormat(data: unknown): data is WorkflowGraph {
  return (
    typeof data === 'object' &&
    data !== null &&
    'nodes' in data &&
    'edges' in data &&
    Array.isArray((data as WorkflowGraph).nodes)
  );
}

// ── Legacy migration ────────────────────────────────────────

export function migrateLinearToGraph(steps: any[]): WorkflowGraph {
  const nodes: WorkflowNodeDefinition[] = [];
  const edges: WorkflowEdgeDefinition[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const y = (i + 1) * 120;
    let type: NodeType = step.type as NodeType;
    let config = { ...step.config };

    // Type conversions
    if (step.type === 'spawn') {
      type = 'run_job';
      config = {
        targetJobId: step.config.targetJobId,
        mode: step.config.waitForCompletion ? 'wait' : 'fire_and_forget',
        input: step.config.input,
      };
    } else if (step.type === 'condition') {
      // Keep expression, drop thenGoto/elseGoto (becomes edges)
      config = { expression: step.config.expression };
    } else if (step.type === 'loop') {
      // Convert to condition + back-edge
      type = 'condition';
      config = { expression: step.config.untilExpression };
    } else if (['signal_parent', 'signal_child', 'wait_for_signal'].includes(step.type)) {
      type = 'run';
      config = { url: '', method: 'GET' };
    }

    nodes.push({
      id: step.id,
      name: step.name,
      type,
      config,
      retryPolicy: step.retryPolicy,
      onFailure: step.onFailure === 'goto' ? 'abort' : step.onFailure,
      position: { x: 250, y },
    });
  }

  // Edges between steps (no start/end nodes needed)

  // Linear edges between steps
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const nextId = i < steps.length - 1 ? steps[i + 1].id : null;

    if (step.type === 'condition' && step.config.thenGoto && step.config.elseGoto) {
      edges.push({ id: `e-${step.id}-true`, source: step.id, sourceHandle: 'true', target: step.config.thenGoto });
      edges.push({ id: `e-${step.id}-false`, source: step.id, sourceHandle: 'false', target: step.config.elseGoto });
    } else if (step.type === 'loop' && nextId) {
      edges.push({ id: `e-${step.id}-done`, source: step.id, sourceHandle: 'true', target: nextId });
      edges.push({
        id: `e-${step.id}-loop`,
        source: step.id,
        sourceHandle: 'false',
        target: step.config.targetStepId,
        loop: { maxIterations: step.config.maxIterations, untilExpression: step.config.untilExpression },
      });
    } else if (nextId) {
      edges.push({ id: `e-${step.id}-${nextId}`, source: step.id, target: nextId });
    }
    // Last step has no outgoing edge — engine treats it as implicit end
  }

  return { nodes, edges };
}

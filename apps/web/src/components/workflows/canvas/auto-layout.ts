import dagre from "@dagrejs/dagre";
import type { WorkflowNodeDefinition, WorkflowEdgeDefinition } from "@/lib/api";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 80;
const CONDITION_WIDTH = 220;
const CONDITION_HEIGHT = 90;

/**
 * Auto-layout workflow nodes using dagre.
 * Returns a new nodes array with computed positions.
 */
export function autoLayout(
  nodes: WorkflowNodeDefinition[],
  edges: WorkflowEdgeDefinition[],
  direction: "TB" | "LR" = "TB",
): WorkflowNodeDefinition[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

  for (const node of nodes) {
    const isCondition = node.type === "condition";
    g.setNode(node.id, {
      width: isCondition ? CONDITION_WIDTH : NODE_WIDTH,
      height: isCondition ? CONDITION_HEIGHT : NODE_HEIGHT,
    });
  }

  for (const edge of edges) {
    if (!edge.loop) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  // Build position map from dagre results
  const posMap = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const pos = g.node(node.id);
    if (!pos) continue;
    const w = node.type === "condition" ? CONDITION_WIDTH : NODE_WIDTH;
    const h = node.type === "condition" ? CONDITION_HEIGHT : NODE_HEIGHT;
    posMap.set(node.id, { x: pos.x - w / 2, y: pos.y - h / 2 });
  }

  // Fix condition branches: ensure true target is on the left, false target is on the right
  // (matching the green/left and red/right handle positions)
  for (const node of nodes) {
    if (node.type !== "condition") continue;

    const trueEdge = edges.find((e) => e.source === node.id && e.sourceHandle === "true");
    const falseEdge = edges.find((e) => e.source === node.id && e.sourceHandle === "false");
    if (!trueEdge || !falseEdge) continue;

    const truePos = posMap.get(trueEdge.target);
    const falsePos = posMap.get(falseEdge.target);
    if (!truePos || !falsePos) continue;

    // If true target is to the right of false target, swap their x positions
    if (truePos.x > falsePos.x) {
      const tmpX = truePos.x;
      truePos.x = falsePos.x;
      falsePos.x = tmpX;
    }
  }

  return nodes.map((node) => {
    const pos = posMap.get(node.id);
    if (!pos) return node;
    return { ...node, position: pos };
  });
}

/**
 * Check if any node is missing a position (needs auto-layout).
 */
export function needsLayout(nodes: WorkflowNodeDefinition[]): boolean {
  return nodes.some((n) => !n.position);
}

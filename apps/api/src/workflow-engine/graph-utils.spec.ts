import { describe, it, expect } from 'vitest';
import type { WorkflowGraph } from '../workflow/workflow.types';
import {
  buildAdjacency,
  topologicalSort,
  computeFrontier,
  getLoopBodyNodes,
  validateGraph,
  isGraphFormat,
  migrateLinearToGraph,
} from './graph-utils';

// ── Helpers ─────────────────────────────────────────────────

function makeGraph(nodes: any[], edges: any[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) =>
      typeof n === 'string'
        ? { id: n, name: n, type: 'run' as const, config: {} }
        : { name: n.id, config: {}, ...n },
    ),
    edges: edges.map((e, i) => ({ id: `e${i}`, ...e })),
  };
}

function linearGraph(): WorkflowGraph {
  return makeGraph(
    [
      { id: 'a', type: 'run' },
      { id: 'b', type: 'run' },
      { id: 'c', type: 'run' },
    ],
    [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ],
  );
}

function branchingGraph(): WorkflowGraph {
  return makeGraph(
    [
      { id: 'entry', type: 'run' },
      { id: 'cond', type: 'condition' },
      { id: 'left', type: 'run' },
      { id: 'right', type: 'run' },
    ],
    [
      { source: 'entry', target: 'cond' },
      { source: 'cond', sourceHandle: 'true', target: 'left' },
      { source: 'cond', sourceHandle: 'false', target: 'right' },
    ],
  );
}

// ── Tests ───────────────────────────────────────────────────

describe('buildAdjacency', () => {
  it('builds outgoing and incoming edge lists', () => {
    const adj = buildAdjacency(linearGraph());
    expect(adj.get('a')!.outgoing).toHaveLength(1);
    expect(adj.get('a')!.incoming).toHaveLength(0); // entry node
    expect(adj.get('b')!.incoming).toHaveLength(1);
    expect(adj.get('c')!.incoming).toHaveLength(1);
    expect(adj.get('c')!.outgoing).toHaveLength(0); // last node
  });
});

describe('topologicalSort', () => {
  it('returns nodes in dependency order', () => {
    const order = topologicalSort(linearGraph());
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('handles branching graphs', () => {
    const order = topologicalSort(branchingGraph());
    expect(order.indexOf('entry')).toBeLessThan(order.indexOf('cond'));
    expect(order.indexOf('cond')).toBeLessThan(order.indexOf('left'));
    expect(order.indexOf('cond')).toBeLessThan(order.indexOf('right'));
  });

  it('ignores loop back-edges', () => {
    const graph = makeGraph(
      [{ id: 'a', type: 'run' }, { id: 'b', type: 'run' }],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a', loop: { maxIterations: 3, untilExpression: 'true' } },
      ],
    );
    const order = topologicalSort(graph);
    expect(order).toHaveLength(2);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
  });
});

describe('computeFrontier', () => {
  it('returns entry node when nothing completed', () => {
    const graph = linearGraph();
    const adj = buildAdjacency(graph);
    const frontier = computeFrontier(graph, adj, new Set(), new Map());
    expect(frontier).toEqual(['a']);
  });

  it('returns next node after completing the predecessor', () => {
    const graph = linearGraph();
    const adj = buildAdjacency(graph);
    const frontier = computeFrontier(graph, adj, new Set(['a']), new Map());
    expect(frontier).toEqual(['b']);
  });

  it('follows condition true branch', () => {
    const graph = branchingGraph();
    const adj = buildAdjacency(graph);
    const completed = new Set(['entry', 'cond']);
    const condResults = new Map([['cond', true]]);
    const frontier = computeFrontier(graph, adj, completed, condResults);
    expect(frontier).toEqual(['left']);
  });

  it('follows condition false branch', () => {
    const graph = branchingGraph();
    const adj = buildAdjacency(graph);
    const completed = new Set(['entry', 'cond']);
    const condResults = new Map([['cond', false]]);
    const frontier = computeFrontier(graph, adj, completed, condResults);
    expect(frontier).toEqual(['right']);
  });

  it('returns multiple nodes for fan-out (parallel)', () => {
    const graph = makeGraph(
      [{ id: 'entry', type: 'run' }, { id: 'a', type: 'run' }, { id: 'b', type: 'run' }],
      [
        { source: 'entry', target: 'a' },
        { source: 'entry', target: 'b' },
      ],
    );
    const adj = buildAdjacency(graph);
    const frontier = computeFrontier(graph, adj, new Set(['entry']), new Map());
    expect(frontier).toContain('a');
    expect(frontier).toContain('b');
    expect(frontier).toHaveLength(2);
  });

  it('waits for all incoming edges at join point', () => {
    const graph = makeGraph(
      [{ id: 'entry', type: 'run' }, { id: 'a', type: 'run' }, { id: 'b', type: 'run' }, { id: 'join', type: 'run' }],
      [
        { source: 'entry', target: 'a' },
        { source: 'entry', target: 'b' },
        { source: 'a', target: 'join' },
        { source: 'b', target: 'join' },
      ],
    );
    const adj = buildAdjacency(graph);
    const frontier = computeFrontier(graph, adj, new Set(['entry', 'a']), new Map());
    expect(frontier).toEqual(['b']);
  });
});

describe('getLoopBodyNodes', () => {
  it('returns nodes between loop target and source', () => {
    const graph = makeGraph(
      [{ id: 'a', type: 'run' }, { id: 'b', type: 'run' }, { id: 'c', type: 'run' }],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
        { source: 'c', target: 'a', loop: { maxIterations: 3, untilExpression: 'true' } },
      ],
    );
    const loopEdge = graph.edges.find((e) => e.loop)!;
    const body = getLoopBodyNodes(graph, loopEdge);
    expect(body).toContain('a');
    expect(body).toContain('b');
    expect(body).toContain('c');
  });
});

describe('validateGraph', () => {
  it('passes for a valid linear graph', () => {
    const errors = validateGraph(linearGraph());
    expect(errors).toHaveLength(0);
  });

  it('passes for a valid branching graph', () => {
    const errors = validateGraph(branchingGraph());
    expect(errors).toHaveLength(0);
  });

  it('fails when no nodes', () => {
    const graph = makeGraph([], []);
    const errors = validateGraph(graph);
    expect(errors.some((e) => e.message.includes('at least one node'))).toBe(true);
  });

  it('fails on self-loop', () => {
    const graph = makeGraph(
      [{ id: 'a', type: 'run' }],
      [{ source: 'a', target: 'a' }],
    );
    const errors = validateGraph(graph);
    expect(errors.some((e) => e.message.includes('Self-loop'))).toBe(true);
  });

  it('fails when condition missing true/false edges', () => {
    const graph = makeGraph(
      [{ id: 'cond', type: 'condition' }, { id: 'a', type: 'run' }],
      [
        { source: 'cond', sourceHandle: 'true', target: 'a' },
        // missing 'false' edge
      ],
    );
    const errors = validateGraph(graph);
    expect(errors.some((e) => e.message.includes('both "true" and "false"'))).toBe(true);
  });

  it('detects multiple entry points (orphan nodes)', () => {
    const graph = makeGraph(
      [{ id: 'a', type: 'run' }, { id: 'b', type: 'run' }, { id: 'orphan', type: 'run' }],
      [
        { source: 'a', target: 'b' },
      ],
    );
    const errors = validateGraph(graph);
    expect(errors.some((e) => e.message.includes('multiple entry points'))).toBe(true);
  });
});

describe('isGraphFormat', () => {
  it('returns true for graph format', () => {
    expect(isGraphFormat({ nodes: [], edges: [] })).toBe(true);
  });

  it('returns false for array format', () => {
    expect(isGraphFormat([{ id: 'a', type: 'run' }])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isGraphFormat(null)).toBe(false);
  });
});

describe('migrateLinearToGraph', () => {
  it('converts linear steps to graph without start/end', () => {
    const steps = [
      { id: 's1', name: 'Step 1', type: 'run', config: { url: 'http://a.com', method: 'GET' } },
      { id: 's2', name: 'Step 2', type: 'run', config: { url: 'http://b.com', method: 'POST' } },
    ];
    const graph = migrateLinearToGraph(steps);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1); // s1→s2
  });

  it('converts spawn to run_job', () => {
    const steps = [
      { id: 's1', name: 'Spawn', type: 'spawn', config: { targetJobId: 'j1', waitForCompletion: true } },
    ];
    const graph = migrateLinearToGraph(steps);
    const node = graph.nodes.find((n) => n.id === 's1');
    expect(node?.type).toBe('run_job');
    expect((node?.config as any).mode).toBe('wait');
  });

  it('converts empty steps to empty graph', () => {
    const graph = migrateLinearToGraph([]);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });
});

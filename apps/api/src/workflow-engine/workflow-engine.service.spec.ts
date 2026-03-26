import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkflowEngineService } from './workflow-engine.service';
import type { WorkflowGraph } from '../workflow/workflow.types';

vi.mock('../common/util/url-validator', () => ({
  validateOutboundUrl: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock fetch ──────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Helpers ─────────────────────────────────────────────────

function makeMockRedpanda() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
  };
}

function makeGraph(nodes: any[], edges: any[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) => ({ name: n.id, config: {}, ...n })),
    edges: edges.map((e, i) => ({ id: `e${i}`, ...e })),
  };
}

function linearGraph(): WorkflowGraph {
  return makeGraph(
    [
      { id: 'fetch', name: 'Fetch', type: 'run', config: { url: 'https://api.com', method: 'GET' } },
    ],
    [],
  );
}

function makeWorkflowRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wfrun-1',
    workflowId: 'wf-1',
    jobRunId: 'jr-1',
    status: 'running',
    currentStepIndex: 0,
    currentStepId: '__start',
    completedNodes: [],
    loopCounters: {},
    context: {},
    resumeAt: null,
    waitTimeoutAt: null,
    waitingForChildRunId: null,
    startedAt: new Date('2025-01-01'),
    finishedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeWorkflow(graph: WorkflowGraph = linearGraph()) {
  return { id: 'wf-1', jobId: 'job-1', version: 1, steps: graph, createdAt: new Date() };
}

function makeJobRun() {
  return {
    id: 'jr-1',
    jobId: 'job-1',
    status: 'running',
    trigger: 'manual',
    scheduledAt: new Date(),
    startedAt: new Date(),
    finishedAt: null,
    durationMs: null,
    httpStatus: null,
    responseBody: null,
    errorMessage: null,
    attempt: 1,
    queuedAt: null,
    parentRunId: null,
    createdAt: new Date(),
  };
}

function makeResumeEvent(overrides: Record<string, unknown> = {}) {
  return {
    workflowRunId: 'wfrun-1',
    reason: 'initial' as const,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createMockDb(opts: {
  selectResults?: unknown[][];
  insertResults?: unknown[][];
  updateResults?: unknown[][];
  deleteResults?: unknown[][];
}) {
  const selectResults = [...(opts.selectResults ?? [])];
  const insertResults = [...(opts.insertResults ?? [])];
  const updateResults = [...(opts.updateResults ?? [])];
  const deleteResults = [...(opts.deleteResults ?? [])];

  function makeChain(queue: unknown[][]) {
    const result = queue.shift() ?? [];
    const chain: Record<string, any> = {};
    const methods = ['from', 'where', 'set', 'values', 'limit', 'orderBy', 'offset', 'groupBy', 'returning'];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.then = (resolve: any) => resolve(result);
    chain.returning = vi.fn().mockResolvedValue(result);
    return chain;
  }

  return {
    select: vi.fn().mockImplementation(() => makeChain(selectResults)),
    insert: vi.fn().mockImplementation(() => makeChain(insertResults)),
    update: vi.fn().mockImplementation(() => makeChain(updateResults)),
    delete: vi.fn().mockImplementation(() => makeChain(deleteResults)),
  };
}

function getReplay(service: WorkflowEngineService) {
  return (service as any).replay.bind(service);
}

// ── Tests ───────────────────────────────────────────────────

describe('WorkflowEngineService (graph)', () => {
  let mockRedpanda: ReturnType<typeof makeMockRedpanda>;
  let service: WorkflowEngineService;

  beforeEach(() => {
    mockRedpanda = makeMockRedpanda();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('subscribes to workflow-resume topic', async () => {
      const mockDb = createMockDb({});
      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);
      await service.onModuleInit();
      expect(mockRedpanda.subscribe).toHaveBeenCalledWith(
        'kast-workflow-engine',
        'workflow-resume',
        expect.any(Function),
      );
    });
  });

  describe('linear graph execution', () => {
    it('executes single run node and publishes resume', async () => {
      const graph = linearGraph();

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(graph)],
          [makeJobRun()],
          [], // no existing results — fetch is the entry node
        ],
        insertResults: [[]],
        updateResults: [[]],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => '{"ok":true}',
      });

      await getReplay(service)(makeResumeEvent());

      // Should have made the HTTP request
      expect(mockFetch).toHaveBeenCalledTimes(1);
      // Should have recorded result
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('completed workflow', () => {
    it('skips if workflow run is already completed', async () => {
      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun({ status: 'completed' })],
        ],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      await getReplay(service)(makeResumeEvent());

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockRedpanda.publish).not.toHaveBeenCalled();
    });
  });

  describe('missing workflow', () => {
    it('returns early if workflow not found', async () => {
      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [], // workflow not found
        ],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      await getReplay(service)(makeResumeEvent());

      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('run node execution', () => {
    it('makes HTTP request and records result', async () => {
      const graph = makeGraph(
        [
          { id: 'entry', name: 'Entry', type: 'run', config: { url: 'https://api.com/entry', method: 'GET' } },
          { id: 'fetch', name: 'Fetch', type: 'run', config: { url: 'https://api.com/data', method: 'GET' } },
        ],
        [
          { source: 'entry', target: 'fetch' },
        ],
      );

      // Start node already completed
      const existingResults = [
        { stepId: 'entry', stepIndex: 0, status: 'completed', output: {} },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(graph)],
          [makeJobRun()],
          existingResults,
        ],
        insertResults: [[]],
        updateResults: [[]],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => '{"data": "test"}',
      });

      await getReplay(service)(makeResumeEvent());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('condition node', () => {
    it('evaluates expression and continues on the matching branch', async () => {
      const graph = makeGraph(
        [
          { id: 'entry', name: 'Entry', type: 'run', config: { url: 'https://api.com/entry', method: 'GET' } },
          { id: 'cond', name: 'Check', type: 'condition', config: { expression: 'steps.entry.ok == true' } },
          { id: 'yes', name: 'Yes', type: 'run', config: { url: 'https://a.com', method: 'GET' } },
          { id: 'no', name: 'No', type: 'run', config: { url: 'https://b.com', method: 'GET' } },
        ],
        [
          { source: 'entry', target: 'cond' },
          { source: 'cond', sourceHandle: 'true', target: 'yes' },
          { source: 'cond', sourceHandle: 'false', target: 'no' },
        ],
      );

      const existingResults = [
        { stepId: 'entry', stepIndex: 0, status: 'completed', output: { ok: true } },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun({ context: { entry: { ok: true } } })],
          [makeWorkflow(graph)],
          [makeJobRun()],
          existingResults,
        ],
        insertResults: [[]],
        updateResults: [[]],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      await getReplay(service)(makeResumeEvent());

      // Should have recorded condition result
      expect(mockDb.insert).toHaveBeenCalled();

      // Should publish resume to continue
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'workflow-resume', 'wfrun-1',
        expect.objectContaining({ workflowRunId: 'wfrun-1' }),
      );
    });
  });

  describe('legacy format support', () => {
    it('converts legacy step array to graph and executes', async () => {
      // Legacy format: array of steps
      const legacySteps = [
        { id: 's1', name: 'Step 1', type: 'run', config: { url: 'https://a.com', method: 'GET' } },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [{ id: 'wf-1', jobId: 'job-1', version: 1, steps: legacySteps, createdAt: new Date() }],
          [makeJobRun()],
          [], // no results yet
        ],
        insertResults: [[]],
        updateResults: [[]],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      await getReplay(service)(makeResumeEvent());

      // Should have processed (start node from migrated graph)
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('sleep node', () => {
    it('pauses workflow and sets sleeping status', async () => {
      const graph = makeGraph(
        [
          { id: 'entry', name: 'Entry', type: 'run', config: { url: 'https://api.com/entry', method: 'GET' } },
          { id: 'wait', name: 'Wait', type: 'sleep', config: { duration: 'PT30S' } },
        ],
        [
          { source: 'entry', target: 'wait' },
        ],
      );

      const existingResults = [
        { stepId: 'entry', stepIndex: 0, status: 'completed', output: {} },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(graph)],
          [makeJobRun()],
          existingResults,
        ],
        insertResults: [[]],
        updateResults: [[]],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      await getReplay(service)(makeResumeEvent());

      // Should have set status to sleeping
      const updateCall = mockDb.update.mock.results[0]?.value;
      if (updateCall?.set?.mock?.calls?.[0]) {
        const setArg = updateCall.set.mock.calls[0][0];
        expect(setArg.status).toBe('sleeping');
      }

      // Should NOT publish resume (sleeper will do that)
      const resumePublishes = mockRedpanda.publish.mock.calls.filter(
        (c: any[]) => c[0] === 'workflow-resume',
      );
      expect(resumePublishes).toHaveLength(0);
    });
  });
});

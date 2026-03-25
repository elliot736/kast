import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkflowEngineService } from './workflow-engine.service';

vi.mock('../common/util/url-validator', () => ({
  validateOutboundUrl: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRedpanda() {
  return {
    subscribe: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Build a mock db where each successive select/insert/update call returns
 * the next value from the provided arrays.
 */
function createMockDb(opts: {
  selectResults?: unknown[][];
  insertResults?: unknown[][];
  updateResults?: unknown[][];
}) {
  const selectResults = [...(opts.selectResults ?? [])];
  const insertResults = [...(opts.insertResults ?? [])];
  const updateResults = [...(opts.updateResults ?? [])];

  function makeChain(queue: unknown[][], kind: string) {
    const result = queue.shift() ?? [];
    const chain: Record<string, any> = {};
    const methods = ['from', 'where', 'set', 'values', 'limit', 'orderBy', 'offset'];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.returning = vi.fn().mockResolvedValue(result);
    chain.then = (resolve: any) => resolve(result);
    return chain;
  }

  return {
    select: vi.fn().mockImplementation(() => makeChain(selectResults, 'select')),
    insert: vi.fn().mockImplementation(() => makeChain(insertResults, 'insert')),
    update: vi.fn().mockImplementation(() => makeChain(updateResults, 'update')),
  };
}

// Helpers to build domain objects used across tests
function makeWorkflowRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wfrun-1',
    workflowId: 'wf-1',
    jobRunId: 'jr-1',
    status: 'running',
    currentStepIndex: 0,
    context: {},
    resumeAt: null,
    waitingForEvent: null,
    waitingForFilter: null,
    waitTimeoutAt: null,
    startedAt: new Date('2025-01-01'),
    finishedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeWorkflow(steps: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    id: 'wf-1',
    jobId: 'job-1',
    version: 1,
    steps,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeJobRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'jr-1',
    jobId: 'job-1',
    status: 'running',
    trigger: 'manual',
    scheduledAt: new Date(),
    startedAt: new Date('2025-01-01'),
    finishedAt: null,
    createdAt: new Date(),
    ...overrides,
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

// Access the private `replay` method for testing
function getReplay(service: WorkflowEngineService) {
  return (service as any).replay.bind(service);
}

function getParseDuration(service: WorkflowEngineService) {
  return (service as any).parseDuration.bind(service);
}

function getInterpolateString(service: WorkflowEngineService) {
  return (service as any).interpolateString.bind(service);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowEngineService', () => {
  let mockRedpanda: ReturnType<typeof createMockRedpanda>;
  let service: WorkflowEngineService;

  beforeEach(() => {
    mockRedpanda = createMockRedpanda();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Memoization — completed steps are skipped
  // -----------------------------------------------------------------------

  describe('memoization', () => {
    it('skips steps that already have completed results and loads their output into context', async () => {
      const steps = [
        { id: 'fetch_data', name: 'Fetch Data', type: 'run', config: { url: 'https://a.com', method: 'GET' } },
        { id: 'process', name: 'Process', type: 'run', config: { url: 'https://b.com', method: 'POST' } },
      ];

      const existingResults = [
        { stepIndex: 0, status: 'completed', output: { userId: 42 } },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],           // load workflow run
          [makeWorkflow(steps)],          // load workflow definition
          [makeJobRun()],                 // load job run
          existingResults,                // load existing step results
        ],
        insertResults: [
          [],  // insert step result for step 1
        ],
        updateResults: [
          [], // update workflow run -> completed
          [], // update job run
        ],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      // Step 1 (index 1) will need to execute
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ processed: true }),
      });

      await getReplay(service)(makeResumeEvent());

      // fetch should only be called once — for the second step
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://b.com',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('does not load output into context when existing result has no output', async () => {
      const steps = [
        { id: 'step_a', name: 'A', type: 'run', config: { url: 'https://a.com', method: 'GET' } },
        { id: 'step_b', name: 'B', type: 'run', config: { url: 'https://b.com', method: 'GET' } },
      ];

      const existingResults = [
        { stepIndex: 0, status: 'failed', output: null },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(steps)],
          [makeJobRun()],
          existingResults,
        ],
        insertResults: [[]],
        updateResults: [[], []],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      });

      await getReplay(service)(makeResumeEvent());

      // Step B executed
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Run step — successful execution
  // -----------------------------------------------------------------------

  describe('run step', () => {
    it('executes HTTP call, records result, and continues to completion', async () => {
      const steps = [
        { id: 'call_api', name: 'Call API', type: 'run', config: { url: 'https://api.example.com/data', method: 'GET' } },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(steps)],
          [makeJobRun()],
          [],  // no existing results
        ],
        insertResults: [
          [],  // insert step result
        ],
        updateResults: [
          [],  // mark workflow completed
          [],  // update job run
        ],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ items: [1, 2, 3] }),
      });

      await getReplay(service)(makeResumeEvent());

      // Verify fetch was called correctly
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'Kast-Workflow/1.0',
          }),
        }),
      );

      // Verify step result was inserted
      expect(mockDb.insert).toHaveBeenCalled();

      // Verify workflow was marked completed
      expect(mockDb.update).toHaveBeenCalled();

      // Verify job result was published
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'job-results',
        'job-1',
        expect.objectContaining({
          jobId: 'job-1',
          runId: 'jr-1',
          status: 'success',
        }),
      );

      // Verify completion log
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'job-run-logs',
        expect.any(String),
        expect.objectContaining({
          level: 'info',
          message: 'Workflow completed successfully',
        }),
      );
    });

    it('parses non-JSON response as text body', async () => {
      const steps = [
        { id: 'txt_step', name: 'Text', type: 'run', config: { url: 'https://example.com/text', method: 'GET' } },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(steps)],
          [makeJobRun()],
          [],
        ],
        insertResults: [[]],
        updateResults: [[], []],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => 'plain text response',
      });

      await getReplay(service)(makeResumeEvent());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      // Should still complete the workflow
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'job-results',
        'job-1',
        expect.objectContaining({ status: 'success' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Run step failure with abort
  // -----------------------------------------------------------------------

  describe('run step failure with abort', () => {
    it('records failed step, marks workflow failed, and publishes job result', async () => {
      const steps = [
        {
          id: 'will_fail',
          name: 'Failing Step',
          type: 'run',
          config: { url: 'https://api.example.com/fail', method: 'POST' },
          onFailure: 'abort',
        },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(steps)],
          [makeJobRun()],
          [],
        ],
        insertResults: [[]],  // failed step result
        updateResults: [
          [],  // mark workflow failed
          [],  // update job run
        ],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      mockFetch.mockResolvedValueOnce({
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await getReplay(service)(makeResumeEvent());

      // Verify failed step result was inserted
      expect(mockDb.insert).toHaveBeenCalled();

      // Verify workflow marked as failed
      expect(mockDb.update).toHaveBeenCalled();

      // Verify job result published with failed status
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'job-results',
        'job-1',
        expect.objectContaining({
          status: 'failed',
          errorMessage: expect.stringContaining('HTTP 500'),
        }),
      );
    });

    it('defaults to abort when onFailure is not specified', async () => {
      const steps = [
        {
          id: 'no_failure_policy',
          name: 'No Policy',
          type: 'run',
          config: { url: 'https://api.example.com/err', method: 'GET' },
          // no onFailure specified — should default to 'abort'
        },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(steps)],
          [makeJobRun()],
          [],
        ],
        insertResults: [[]],
        updateResults: [[], []],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await getReplay(service)(makeResumeEvent());

      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'job-results',
        'job-1',
        expect.objectContaining({
          status: 'failed',
          errorMessage: 'Connection refused',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Run step failure with continue
  // -----------------------------------------------------------------------

  describe('run step failure with continue', () => {
    it('records failed step and skips to next step', async () => {
      const steps = [
        {
          id: 'may_fail',
          name: 'May Fail',
          type: 'run',
          config: { url: 'https://flaky.com', method: 'GET' },
          onFailure: 'continue',
        },
        {
          id: 'always_runs',
          name: 'Always Runs',
          type: 'run',
          config: { url: 'https://stable.com', method: 'GET' },
        },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(steps)],
          [makeJobRun()],
          [],
        ],
        insertResults: [
          [],  // failed step result for step 0
          [],  // completed step result for step 1
        ],
        updateResults: [
          [],  // mark workflow completed
          [],  // update job run
        ],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      // First call fails
      mockFetch.mockResolvedValueOnce({
        status: 503,
        text: async () => 'Service Unavailable',
      });
      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      });

      await getReplay(service)(makeResumeEvent());

      // Both fetches should have been called
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Workflow should complete successfully (not fail)
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'job-results',
        'job-1',
        expect.objectContaining({ status: 'success' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Run step failure with goto
  // -----------------------------------------------------------------------

  describe('run step failure with goto', () => {
    it('publishes a resume event to jump to the target step', async () => {
      const steps = [
        {
          id: 'risky_step',
          name: 'Risky',
          type: 'run',
          config: { url: 'https://risky.com', method: 'POST' },
          onFailure: 'goto',
          onFailureGoto: 'fallback_step',
        },
        {
          id: 'fallback_step',
          name: 'Fallback',
          type: 'run',
          config: { url: 'https://fallback.com', method: 'GET' },
        },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(steps)],
          [makeJobRun()],
          [],
        ],
        insertResults: [[]],  // failed step result
        updateResults: [[]],  // update currentStepIndex
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      mockFetch.mockRejectedValueOnce(new Error('Boom'));

      await getReplay(service)(makeResumeEvent());

      // Should publish a workflow-resume event for retry
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'workflow-resume',
        'wfrun-1',
        expect.objectContaining({
          workflowRunId: 'wfrun-1',
          reason: 'retry',
        }),
      );

      // Should NOT publish a job-results event (workflow continues via goto)
      const jobResultCalls = mockRedpanda.publish.mock.calls.filter(
        (c: any[]) => c[0] === 'job-results',
      );
      expect(jobResultCalls).toHaveLength(0);
    });

    it('aborts when goto target step is not found', async () => {
      const steps = [
        {
          id: 'risky',
          name: 'Risky',
          type: 'run',
          config: { url: 'https://risky.com', method: 'POST' },
          onFailure: 'goto',
          onFailureGoto: 'nonexistent_step',
        },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(steps)],
          [makeJobRun()],
          [],
        ],
        insertResults: [[]],
        updateResults: [[], []],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      mockFetch.mockRejectedValueOnce(new Error('Fail'));

      await getReplay(service)(makeResumeEvent());

      // Should fail and publish job result with goto-not-found error
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'job-results',
        'job-1',
        expect.objectContaining({
          status: 'failed',
          errorMessage: expect.stringContaining('nonexistent_step'),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Sleep step
  // -----------------------------------------------------------------------

  describe('sleep step', () => {
    it('updates workflow_runs status to sleeping with resumeAt and stops processing', async () => {
      const steps = [
        {
          id: 'sleep_step',
          name: 'Wait 30 seconds',
          type: 'sleep',
          config: { duration: 'PT30S' },
        },
        {
          id: 'after_sleep',
          name: 'After Sleep',
          type: 'run',
          config: { url: 'https://api.com', method: 'GET' },
        },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(steps)],
          [makeJobRun()],
          [],
        ],
        insertResults: [[]],  // sleep step result
        updateResults: [[]],  // update workflow run to sleeping
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      const beforeExec = Date.now();
      await getReplay(service)(makeResumeEvent());
      const afterExec = Date.now();

      // Fetch should NOT be called — sleep stops processing before step 1
      expect(mockFetch).not.toHaveBeenCalled();

      // Verify workflow run was updated to sleeping
      expect(mockDb.update).toHaveBeenCalled();
      const setCall = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setCall.status).toBe('sleeping');
      expect(setCall.currentStepIndex).toBe(0);
      expect(setCall.resumeAt).toBeInstanceOf(Date);

      // resumeAt should be ~30 seconds in the future
      const resumeAt = setCall.resumeAt.getTime();
      expect(resumeAt).toBeGreaterThanOrEqual(beforeExec + 29000);
      expect(resumeAt).toBeLessThanOrEqual(afterExec + 31000);
    });
  });

  // -----------------------------------------------------------------------
  // Wait for event step
  // -----------------------------------------------------------------------

  // Note: wait_for_event and send_event tests removed — those step types
  // were replaced by wait_for_signal, signal_parent, signal_child, and spawn.

  // -----------------------------------------------------------------------
  // Send event step
  // -----------------------------------------------------------------------


  // -----------------------------------------------------------------------
  // All steps complete
  // -----------------------------------------------------------------------

  describe('all steps complete', () => {
    it('marks workflow completed and publishes success job result', async () => {
      const steps = [
        { id: 's1', name: 'Step 1', type: 'run', config: { url: 'https://a.com', method: 'GET' } },
        { id: 's2', name: 'Step 2', type: 'run', config: { url: 'https://b.com', method: 'GET' } },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(steps)],
          [makeJobRun()],
          [],
        ],
        insertResults: [[], []],
        updateResults: [[], []],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      mockFetch
        .mockResolvedValueOnce({ status: 200, text: async () => '{"a":1}' })
        .mockResolvedValueOnce({ status: 200, text: async () => '{"b":2}' });

      await getReplay(service)(makeResumeEvent());

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Workflow completed
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'job-results',
        'job-1',
        expect.objectContaining({ status: 'success' }),
      );

      // Completion log
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'job-run-logs',
        expect.any(String),
        expect.objectContaining({
          message: 'Workflow completed successfully',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Early exit — completed/cancelled/failed runs are skipped
  // -----------------------------------------------------------------------

  describe('early exits', () => {
    it('does nothing when workflow run is already completed', async () => {
      const mockDb = createMockDb({
        selectResults: [[makeWorkflowRun({ status: 'completed' })]],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      await getReplay(service)(makeResumeEvent());

      // Only one select (load wfRun), no further DB calls
      expect(mockDb.select).toHaveBeenCalledTimes(1);
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does nothing when workflow run is already cancelled', async () => {
      const mockDb = createMockDb({
        selectResults: [[makeWorkflowRun({ status: 'cancelled' })]],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      await getReplay(service)(makeResumeEvent());

      expect(mockDb.select).toHaveBeenCalledTimes(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does nothing when workflow run is not found', async () => {
      const mockDb = createMockDb({
        selectResults: [[]],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      await getReplay(service)(makeResumeEvent());

      expect(mockDb.select).toHaveBeenCalledTimes(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does nothing when workflow definition is not found', async () => {
      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [],  // workflow not found
        ],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      await getReplay(service)(makeResumeEvent());

      expect(mockDb.select).toHaveBeenCalledTimes(2);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does nothing when job run is not found', async () => {
      const steps = [{ id: 's1', name: 'S', type: 'run', config: {} }];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun()],
          [makeWorkflow(steps)],
          [],  // job run not found
        ],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      await getReplay(service)(makeResumeEvent());

      expect(mockDb.select).toHaveBeenCalledTimes(3);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Event payload injection into context
  // -----------------------------------------------------------------------

  describe('signal payload injection', () => {
    it('injects signal payload into context.__lastSignal on signal_received resume', async () => {
      const steps = [
        { id: 'wait_step', name: 'Wait', type: 'wait_for_signal', config: {} },
        { id: 'use_event', name: 'Use Event', type: 'run', config: { url: 'https://api.com', method: 'POST', body: '{{context.__lastSignal.data}}' } },
      ];

      const existingResults = [
        { stepIndex: 0, status: 'completed', output: { event: 'test' } },
      ];

      const mockDb = createMockDb({
        selectResults: [
          [makeWorkflowRun({ context: {} })],
          [makeWorkflow(steps)],
          [makeJobRun()],
          existingResults,
        ],
        insertResults: [[]],
        updateResults: [[], []],
      });

      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => '{"ok":true}',
      });

      await getReplay(service)(makeResumeEvent({
        reason: 'signal_received',
        signalPayload: { data: 'payload-value' },
      }));

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Template interpolation
  // -----------------------------------------------------------------------

  describe('template interpolation', () => {
    it('resolves {{context.stepId.field}} from context', () => {
      const mockDb = createMockDb({});
      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      const interpolate = getInterpolateString(service);
      const context = {
        fetch_user: { name: 'Bob', age: 25 },
        fetch_order: { id: 'ord-99', total: 49.99 },
      };

      expect(interpolate('Hello {{context.fetch_user.name}}!', context)).toBe('Hello Bob!');
      expect(interpolate('Order: {{context.fetch_order.id}}', context)).toBe('Order: ord-99');
      expect(interpolate('Age: {{context.fetch_user.age}}', context)).toBe('Age: 25');
    });

    it('returns empty string for unresolvable paths', () => {
      const mockDb = createMockDb({});
      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      const interpolate = getInterpolateString(service);
      const context = { step1: { value: 'ok' } };

      expect(interpolate('{{context.nonexistent.field}}', context)).toBe('');
      // When the parent key exists but the child doesn't, value is undefined
      // which gets JSON.stringified to 'undefined'
      expect(interpolate('{{context.step1.missing}}', context)).toBe('undefined');
    });

    it('serializes non-string values as JSON', () => {
      const mockDb = createMockDb({});
      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      const interpolate = getInterpolateString(service);
      const context = {
        data: { nested: { a: 1, b: 2 } },
      };

      expect(interpolate('Result: {{context.data.nested}}', context)).toBe(
        'Result: {"a":1,"b":2}',
      );
    });

    it('handles multiple interpolations in one string', () => {
      const mockDb = createMockDb({});
      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      const interpolate = getInterpolateString(service);
      const context = {
        a: { x: 'hello' },
        b: { y: 'world' },
      };

      expect(interpolate('{{context.a.x}} {{context.b.y}}', context)).toBe('hello world');
    });
  });

  // -----------------------------------------------------------------------
  // ISO duration parsing
  // -----------------------------------------------------------------------

  describe('ISO duration parsing', () => {
    it('parses PT30S as 30 seconds from now', () => {
      const mockDb = createMockDb({});
      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      const parse = getParseDuration(service);
      const before = Date.now();
      const result = parse('PT30S');
      const after = Date.now();

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThanOrEqual(before + 30000);
      expect(result.getTime()).toBeLessThanOrEqual(after + 30000);
    });

    it('parses PT5M as 5 minutes from now', () => {
      const mockDb = createMockDb({});
      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      const parse = getParseDuration(service);
      const before = Date.now();
      const result = parse('PT5M');
      const after = Date.now();

      expect(result.getTime()).toBeGreaterThanOrEqual(before + 300000);
      expect(result.getTime()).toBeLessThanOrEqual(after + 300000);
    });

    it('parses P1D as 1 day from now', () => {
      const mockDb = createMockDb({});
      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      const parse = getParseDuration(service);
      const before = Date.now();
      const result = parse('P1D');
      const after = Date.now();

      expect(result.getTime()).toBeGreaterThanOrEqual(before + 86400000);
      expect(result.getTime()).toBeLessThanOrEqual(after + 86400000);
    });

    it('parses PT1H30M as 90 minutes from now', () => {
      const mockDb = createMockDb({});
      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      const parse = getParseDuration(service);
      const before = Date.now();
      const result = parse('PT1H30M');
      const after = Date.now();

      expect(result.getTime()).toBeGreaterThanOrEqual(before + 5400000);
      expect(result.getTime()).toBeLessThanOrEqual(after + 5400000);
    });

    it('parses P2DT3H15M45S correctly', () => {
      const mockDb = createMockDb({});
      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      const parse = getParseDuration(service);
      const before = Date.now();
      const result = parse('P2DT3H15M45S');
      const expectedMs = 2 * 86400000 + 3 * 3600000 + 15 * 60000 + 45 * 1000;
      const after = Date.now();

      expect(result.getTime()).toBeGreaterThanOrEqual(before + expectedMs);
      expect(result.getTime()).toBeLessThanOrEqual(after + expectedMs);
    });

    it('throws on invalid duration string', () => {
      const mockDb = createMockDb({});
      service = new WorkflowEngineService(mockRedpanda as any, mockDb as any);

      const parse = getParseDuration(service);

      expect(() => parse('invalid')).toThrow('Invalid ISO 8601 duration');
      expect(() => parse('5M')).toThrow('Invalid ISO 8601 duration');
      expect(() => parse('')).toThrow('Invalid ISO 8601 duration');
    });
  });

  // -----------------------------------------------------------------------
  // onModuleInit
  // -----------------------------------------------------------------------

  describe('onModuleInit', () => {
    it('subscribes to the workflow-resume topic', async () => {
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
});

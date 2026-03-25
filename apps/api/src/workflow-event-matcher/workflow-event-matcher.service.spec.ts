import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEventMatcherService } from './workflow-event-matcher.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRedpanda() {
  return {
    subscribe: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockDb(opts: {
  selectResults?: unknown[][];
  insertResults?: unknown[][];
  updateResults?: unknown[][];
}) {
  const selectResults = [...(opts.selectResults ?? [])];
  const insertResults = [...(opts.insertResults ?? [])];
  const updateResults = [...(opts.updateResults ?? [])];

  function makeChain(queue: unknown[][]) {
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
    select: vi.fn().mockImplementation(() => makeChain(selectResults)),
    insert: vi.fn().mockImplementation(() => makeChain(insertResults)),
    update: vi.fn().mockImplementation(() => makeChain(updateResults)),
  };
}

function makeWaitingRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wfrun-1',
    workflowId: 'wf-1',
    jobRunId: 'jr-1',
    status: 'waiting',
    currentStepIndex: 2,
    context: {},
    waitingForEvent: 'order.placed',
    waitingForFilter: null,
    waitTimeoutAt: null,
    startedAt: new Date('2025-01-01'),
    finishedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeUserEvent(overrides: Record<string, unknown> = {}) {
  return {
    name: 'order.placed',
    payload: { orderId: 'ord-123', amount: 99.99 },
    source: 'external',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// Access the private matchEvent method
function getMatchEvent(service: WorkflowEventMatcherService) {
  return (service as any).matchEvent.bind(service);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowEventMatcherService', () => {
  let mockRedpanda: ReturnType<typeof createMockRedpanda>;

  beforeEach(() => {
    mockRedpanda = createMockRedpanda();
  });

  // -----------------------------------------------------------------------
  // matchEvent — basic matching
  // -----------------------------------------------------------------------

  describe('matchEvent', () => {
    it('finds waiting runs matching event name and publishes resume events', async () => {
      const run = makeWaitingRun();

      const mockDb = createMockDb({
        selectResults: [[run]],
        insertResults: [[]],
        updateResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const matchEvent = getMatchEvent(service);

      await matchEvent(makeUserEvent());

      // Should insert step result
      expect(mockDb.insert).toHaveBeenCalledTimes(1);

      // Should update the workflow run to reset wait state
      expect(mockDb.update).toHaveBeenCalledTimes(1);
      const updateChain = mockDb.update.mock.results[0].value;
      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'running',
        waitingForEvent: null,
        waitingForFilter: null,
        waitTimeoutAt: null,
      });

      // Should publish resume event
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'workflow-resume',
        'wfrun-1',
        expect.objectContaining({
          workflowRunId: 'wfrun-1',
          reason: 'event_received',
          eventPayload: { orderId: 'ord-123', amount: 99.99 },
          timestamp: expect.any(String),
        }),
      );
    });

    it('matches multiple waiting runs for the same event', async () => {
      const run1 = makeWaitingRun({ id: 'run-a' });
      const run2 = makeWaitingRun({ id: 'run-b' });

      const mockDb = createMockDb({
        selectResults: [[run1, run2]],
        insertResults: [[], []],
        updateResults: [[], []],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const matchEvent = getMatchEvent(service);

      await matchEvent(makeUserEvent());

      expect(mockRedpanda.publish).toHaveBeenCalledTimes(2);
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'workflow-resume',
        'run-a',
        expect.objectContaining({ workflowRunId: 'run-a' }),
      );
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'workflow-resume',
        'run-b',
        expect.objectContaining({ workflowRunId: 'run-b' }),
      );
    });

    it('does nothing when no waiting runs match the event', async () => {
      const mockDb = createMockDb({
        selectResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const matchEvent = getMatchEvent(service);

      await matchEvent(makeUserEvent({ name: 'unknown.event' }));

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockRedpanda.publish).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // matchEvent — filter matching
  // -----------------------------------------------------------------------

  describe('matchEvent with filters', () => {
    it('resumes when all filter keys match the event payload', async () => {
      const run = makeWaitingRun({
        waitingForFilter: { orderId: 'ord-123' },
      });

      const mockDb = createMockDb({
        selectResults: [[run]],
        insertResults: [[]],
        updateResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const matchEvent = getMatchEvent(service);

      await matchEvent(makeUserEvent({
        payload: { orderId: 'ord-123', amount: 50 },
      }));

      // Filter matches -> should resume
      expect(mockRedpanda.publish).toHaveBeenCalledTimes(1);
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'workflow-resume',
        'wfrun-1',
        expect.objectContaining({ reason: 'event_received' }),
      );
    });

    it('skips runs where filter does not match the event payload', async () => {
      const run = makeWaitingRun({
        waitingForFilter: { orderId: 'ord-999' },
      });

      const mockDb = createMockDb({
        selectResults: [[run]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const matchEvent = getMatchEvent(service);

      await matchEvent(makeUserEvent({
        payload: { orderId: 'ord-123', amount: 50 },
      }));

      // Filter does NOT match -> should skip
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockRedpanda.publish).not.toHaveBeenCalled();
    });

    it('skips runs where only partial filter keys match', async () => {
      const run = makeWaitingRun({
        waitingForFilter: { orderId: 'ord-123', region: 'us-east' },
      });

      const mockDb = createMockDb({
        selectResults: [[run]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const matchEvent = getMatchEvent(service);

      // orderId matches but region doesn't
      await matchEvent(makeUserEvent({
        payload: { orderId: 'ord-123', region: 'eu-west' },
      }));

      expect(mockRedpanda.publish).not.toHaveBeenCalled();
    });

    it('resumes runs with multi-key filters when all keys match', async () => {
      const run = makeWaitingRun({
        waitingForFilter: { userId: 'u1', action: 'approve' },
      });

      const mockDb = createMockDb({
        selectResults: [[run]],
        insertResults: [[]],
        updateResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const matchEvent = getMatchEvent(service);

      await matchEvent(makeUserEvent({
        payload: { userId: 'u1', action: 'approve', extra: 'ignored' },
      }));

      expect(mockRedpanda.publish).toHaveBeenCalledTimes(1);
    });

    it('resumes runs with no filter (null waitingForFilter)', async () => {
      const run = makeWaitingRun({ waitingForFilter: null });

      const mockDb = createMockDb({
        selectResults: [[run]],
        insertResults: [[]],
        updateResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const matchEvent = getMatchEvent(service);

      await matchEvent(makeUserEvent());

      expect(mockRedpanda.publish).toHaveBeenCalledTimes(1);
    });

    it('handles mixed matching and non-matching runs', async () => {
      const matchingRun = makeWaitingRun({
        id: 'run-match',
        waitingForFilter: { type: 'premium' },
      });
      const nonMatchingRun = makeWaitingRun({
        id: 'run-skip',
        waitingForFilter: { type: 'basic' },
      });

      const mockDb = createMockDb({
        selectResults: [[matchingRun, nonMatchingRun]],
        insertResults: [[]],
        updateResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const matchEvent = getMatchEvent(service);

      await matchEvent(makeUserEvent({
        payload: { type: 'premium', data: 'stuff' },
      }));

      // Only the matching run should be resumed
      expect(mockRedpanda.publish).toHaveBeenCalledTimes(1);
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'workflow-resume',
        'run-match',
        expect.objectContaining({ workflowRunId: 'run-match' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // matchEvent — records wait step as completed
  // -----------------------------------------------------------------------

  describe('matchEvent records step result', () => {
    it('inserts a completed step result with event details', async () => {
      const run = makeWaitingRun({ currentStepIndex: 3 });

      const mockDb = createMockDb({
        selectResults: [[run]],
        insertResults: [[]],
        updateResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const matchEvent = getMatchEvent(service);

      const event = makeUserEvent();
      await matchEvent(event);

      expect(mockDb.insert).toHaveBeenCalledTimes(1);

      // Verify the insert chain was called with values
      const insertChain = mockDb.insert.mock.results[0].value;
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowRunId: 'wfrun-1',
          stepId: '__wait_3',
          stepIndex: 3,
          status: 'completed',
          output: expect.objectContaining({
            event: 'order.placed',
            payload: { orderId: 'ord-123', amount: 99.99 },
          }),
          finishedAt: expect.any(Date),
        }),
      );
    });

    it('uses currentStepIndex 0 when currentStepIndex is null', async () => {
      const run = makeWaitingRun({ currentStepIndex: null });

      const mockDb = createMockDb({
        selectResults: [[run]],
        insertResults: [[]],
        updateResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const matchEvent = getMatchEvent(service);

      await matchEvent(makeUserEvent());

      const insertChain = mockDb.insert.mock.results[0].value;
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          stepId: '__wait_0',
          stepIndex: 0,
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // matchEvent — error handling
  // -----------------------------------------------------------------------

  describe('matchEvent error handling', () => {
    it('handles errors gracefully and continues processing other runs', async () => {
      const run1 = makeWaitingRun({ id: 'run-fail' });
      const run2 = makeWaitingRun({ id: 'run-ok' });

      const mockDb = createMockDb({
        selectResults: [[run1, run2]],
        insertResults: [[], []],
        updateResults: [[], []],
      });

      // First insert fails
      let insertCallCount = 0;
      mockDb.insert = vi.fn().mockImplementation(() => {
        insertCallCount++;
        if (insertCallCount === 1) {
          throw new Error('Insert failed');
        }
        const chain: Record<string, any> = {};
        const methods = ['from', 'where', 'set', 'values', 'limit', 'orderBy', 'offset'];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }
        chain.returning = vi.fn().mockResolvedValue([]);
        chain.then = (resolve: any) => resolve([]);
        return chain;
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const matchEvent = getMatchEvent(service);

      // Should not throw
      await expect(matchEvent(makeUserEvent())).resolves.toBeUndefined();

      // Second run should still be processed
      expect(mockRedpanda.publish).toHaveBeenCalledTimes(1);
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'workflow-resume',
        'run-ok',
        expect.any(Object),
      );
    });
  });

  // -----------------------------------------------------------------------
  // sweepTimeouts — finds timed-out waits
  // -----------------------------------------------------------------------

  describe('sweepTimeouts', () => {
    it('finds timed-out waits and marks them failed', async () => {
      const timedOutRun = makeWaitingRun({
        id: 'run-timeout',
        waitTimeoutAt: new Date(Date.now() - 60000), // 1 minute ago
        currentStepIndex: 1,
      });

      const mockDb = createMockDb({
        selectResults: [[timedOutRun]],
        insertResults: [[]],
        updateResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);

      await service.sweepTimeouts();

      // Should insert a failed step result
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      const insertChain = mockDb.insert.mock.results[0].value;
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowRunId: 'run-timeout',
          stepId: '__wait_1',
          stepIndex: 1,
          status: 'failed',
          errorMessage: 'Wait for event timed out',
        }),
      );

      // Should update workflow run to failed
      expect(mockDb.update).toHaveBeenCalledTimes(1);
      const updateChain = mockDb.update.mock.results[0].value;
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          finishedAt: expect.any(Date),
          waitingForEvent: null,
          waitingForFilter: null,
          waitTimeoutAt: null,
        }),
      );
    });

    it('handles multiple timed-out runs', async () => {
      const runs = [
        makeWaitingRun({ id: 'run-t1', waitTimeoutAt: new Date(Date.now() - 120000) }),
        makeWaitingRun({ id: 'run-t2', waitTimeoutAt: new Date(Date.now() - 30000) }),
      ];

      const mockDb = createMockDb({
        selectResults: [runs],
        insertResults: [[], []],
        updateResults: [[], []],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);

      await service.sweepTimeouts();

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      expect(mockDb.update).toHaveBeenCalledTimes(2);
    });

    it('skips waits not yet timed out (query returns empty)', async () => {
      const mockDb = createMockDb({
        selectResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);

      await service.sweepTimeouts();

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('uses currentStepIndex 0 when currentStepIndex is null', async () => {
      const run = makeWaitingRun({
        id: 'run-null-idx',
        currentStepIndex: null,
        waitTimeoutAt: new Date(Date.now() - 10000),
      });

      const mockDb = createMockDb({
        selectResults: [[run]],
        insertResults: [[]],
        updateResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);

      await service.sweepTimeouts();

      const insertChain = mockDb.insert.mock.results[0].value;
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          stepId: '__wait_0',
          stepIndex: 0,
        }),
      );
    });

    it('handles errors gracefully for individual runs', async () => {
      const run1 = makeWaitingRun({ id: 'run-err' });
      const run2 = makeWaitingRun({ id: 'run-ok-2' });

      let insertCallCount = 0;
      const mockDb = createMockDb({
        selectResults: [[run1, run2]],
        updateResults: [[], []],
      });

      // First insert throws, second succeeds
      mockDb.insert = vi.fn().mockImplementation(() => {
        insertCallCount++;
        if (insertCallCount === 1) {
          throw new Error('DB error');
        }
        const chain: Record<string, any> = {};
        const methods = ['from', 'where', 'set', 'values', 'limit', 'orderBy', 'offset'];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }
        chain.returning = vi.fn().mockResolvedValue([]);
        chain.then = (resolve: any) => resolve([]);
        return chain;
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);

      await expect(service.sweepTimeouts()).resolves.toBeUndefined();

      // Second run should still be processed
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // onModuleInit
  // -----------------------------------------------------------------------

  describe('onModuleInit', () => {
    it('subscribes to the workflow-events topic', async () => {
      const mockDb = createMockDb({});

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);

      await service.onModuleInit();

      expect(mockRedpanda.subscribe).toHaveBeenCalledWith(
        'kast-workflow-event-matcher',
        'workflow-events',
        expect.any(Function),
      );
    });
  });
});

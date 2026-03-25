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
    waitTimeoutAt: null,
    waitingForChildRunId: null,
    startedAt: new Date('2025-01-01'),
    finishedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeSignalEvent(overrides: Record<string, unknown> = {}) {
  return {
    targetRunId: 'wfrun-1',
    sourceRunId: 'child-run-1',
    sourceStepId: 'step-signal',
    payload: { result: 'ok' },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// Access private deliverSignal
function getDeliverSignal(service: WorkflowEventMatcherService) {
  return (service as any).deliverSignal.bind(service);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowEventMatcherService', () => {
  let mockRedpanda: ReturnType<typeof createMockRedpanda>;

  beforeEach(() => {
    mockRedpanda = createMockRedpanda();
  });

  describe('deliverSignal', () => {
    it('delivers signal when target run is waiting', async () => {
      const run = makeWaitingRun();

      const mockDb = createMockDb({
        selectResults: [[run]],
        insertResults: [[]],
        updateResults: [[], []],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const deliverSignal = getDeliverSignal(service);

      await deliverSignal(makeSignalEvent());

      // Should update signals as delivered
      expect(mockDb.update).toHaveBeenCalled();

      // Should insert step result
      expect(mockDb.insert).toHaveBeenCalledTimes(1);

      // Should publish resume event
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'workflow-resume',
        'wfrun-1',
        expect.objectContaining({
          workflowRunId: 'wfrun-1',
          reason: 'signal_received',
          signalPayload: { result: 'ok' },
        }),
      );
    });

    it('does nothing when target run is not waiting', async () => {
      const mockDb = createMockDb({
        selectResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);
      const deliverSignal = getDeliverSignal(service);

      await deliverSignal(makeSignalEvent());

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockRedpanda.publish).not.toHaveBeenCalled();
    });
  });

  describe('sweepTimeouts', () => {
    it('marks timed-out waiting runs as failed', async () => {
      const timedOutRun = makeWaitingRun({
        id: 'run-timeout',
        waitTimeoutAt: new Date(Date.now() - 60000),
        currentStepIndex: 1,
      });

      const mockDb = createMockDb({
        selectResults: [[timedOutRun]],
        insertResults: [[]],
        updateResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);

      await service.sweepTimeouts();

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      const insertChain = mockDb.insert.mock.results[0].value;
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowRunId: 'run-timeout',
          stepId: '__wait_1',
          stepIndex: 1,
          status: 'failed',
          errorMessage: 'Signal wait timed out',
        }),
      );

      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no timed-out runs exist', async () => {
      const mockDb = createMockDb({
        selectResults: [[]],
      });

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);

      await service.sweepTimeouts();

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('handles errors gracefully for individual runs', async () => {
      const run1 = makeWaitingRun({ id: 'run-err' });
      const run2 = makeWaitingRun({ id: 'run-ok-2' });

      let insertCallCount = 0;
      const mockDb = createMockDb({
        selectResults: [[run1, run2]],
        updateResults: [[], []],
      });

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

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('onModuleInit', () => {
    it('subscribes to the workflow-signals topic', async () => {
      const mockDb = createMockDb({});

      const service = new WorkflowEventMatcherService(mockRedpanda as any, mockDb as any);

      await service.onModuleInit();

      expect(mockRedpanda.subscribe).toHaveBeenCalledWith(
        'kast-workflow-signal-delivery',
        'workflow-signals',
        expect.any(Function),
      );
    });
  });
});

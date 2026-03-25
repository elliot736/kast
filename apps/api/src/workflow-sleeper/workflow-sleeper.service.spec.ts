import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowSleeperService } from './workflow-sleeper.service';

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
  updateResults?: unknown[][];
}) {
  const selectResults = [...(opts.selectResults ?? [])];
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
    insert: vi.fn().mockImplementation(() => makeChain([])),
    update: vi.fn().mockImplementation(() => makeChain(updateResults)),
  };
}

function makeSleepingRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wfrun-1',
    workflowId: 'wf-1',
    jobRunId: 'jr-1',
    status: 'sleeping',
    currentStepIndex: 2,
    context: {},
    resumeAt: new Date(Date.now() - 60000), // 1 minute ago (past due)
    startedAt: new Date('2025-01-01'),
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowSleeperService', () => {
  let mockRedpanda: ReturnType<typeof createMockRedpanda>;
  let service: WorkflowSleeperService;

  beforeEach(() => {
    mockRedpanda = createMockRedpanda();
  });

  // -----------------------------------------------------------------------
  // sweep — finds sleeping workflows past resumeAt
  // -----------------------------------------------------------------------

  describe('sweep', () => {
    it('finds sleeping workflows past resumeAt and publishes resume events', async () => {
      const run1 = makeSleepingRun({ id: 'run-a' });
      const run2 = makeSleepingRun({ id: 'run-b' });

      const mockDb = createMockDb({
        selectResults: [[run1, run2]],
        updateResults: [[], []],
      });

      service = new WorkflowSleeperService(mockRedpanda as any, mockDb as any);

      await service.sweep();

      // Should publish resume events for both runs
      expect(mockRedpanda.publish).toHaveBeenCalledTimes(2);

      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'workflow-resume',
        'run-a',
        expect.objectContaining({
          workflowRunId: 'run-a',
          reason: 'sleep_expired',
          timestamp: expect.any(String),
        }),
      );

      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'workflow-resume',
        'run-b',
        expect.objectContaining({
          workflowRunId: 'run-b',
          reason: 'sleep_expired',
        }),
      );
    });

    it('resets sleep state — sets status back to running and resumeAt to null', async () => {
      const run = makeSleepingRun();

      const mockDb = createMockDb({
        selectResults: [[run]],
        updateResults: [[]],
      });

      service = new WorkflowSleeperService(mockRedpanda as any, mockDb as any);

      await service.sweep();

      // Verify the update was called with correct set values
      expect(mockDb.update).toHaveBeenCalled();
      const updateChain = mockDb.update.mock.results[0].value;
      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'running',
        resumeAt: null,
      });
      expect(updateChain.where).toHaveBeenCalled();
    });

    it('skips when no sleeping workflows are found', async () => {
      const mockDb = createMockDb({
        selectResults: [[]],
      });

      service = new WorkflowSleeperService(mockRedpanda as any, mockDb as any);

      await service.sweep();

      expect(mockRedpanda.publish).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('skips sleeping workflows not yet due (query relies on lte)', async () => {
      // The service queries for sleeping runs where resumeAt <= now.
      // If the DB query returns nothing, no action is taken.
      const mockDb = createMockDb({
        selectResults: [[]], // DB returns nothing because resumeAt is in the future
      });

      service = new WorkflowSleeperService(mockRedpanda as any, mockDb as any);

      await service.sweep();

      expect(mockRedpanda.publish).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('handles errors gracefully — continues processing other runs', async () => {
      const run1 = makeSleepingRun({ id: 'run-fail' });
      const run2 = makeSleepingRun({ id: 'run-ok' });

      // First update succeeds, but publish for first run fails
      // Second run should still be processed
      let updateCallCount = 0;
      const mockDb = createMockDb({
        selectResults: [[run1, run2]],
        updateResults: [[], []],
      });

      service = new WorkflowSleeperService(mockRedpanda as any, mockDb as any);

      // First publish call fails, second succeeds
      mockRedpanda.publish
        .mockRejectedValueOnce(new Error('Kafka unavailable'))
        .mockResolvedValueOnce(undefined);

      // Should not throw
      await expect(service.sweep()).resolves.toBeUndefined();

      // Second run should still have been attempted
      expect(mockRedpanda.publish).toHaveBeenCalledTimes(2);
    });

    it('handles DB update failure gracefully', async () => {
      const run = makeSleepingRun({ id: 'run-db-fail' });

      const mockDb = createMockDb({
        selectResults: [[run]],
      });

      // Make update throw
      mockDb.update = vi.fn().mockImplementation(() => {
        throw new Error('DB connection lost');
      });

      service = new WorkflowSleeperService(mockRedpanda as any, mockDb as any);

      await expect(service.sweep()).resolves.toBeUndefined();

      // Publish should not have been called since update failed first
      expect(mockRedpanda.publish).not.toHaveBeenCalled();
    });

    it('processes multiple sleeping runs independently', async () => {
      const runs = [
        makeSleepingRun({ id: 'run-1' }),
        makeSleepingRun({ id: 'run-2' }),
        makeSleepingRun({ id: 'run-3' }),
      ];

      const mockDb = createMockDb({
        selectResults: [runs],
        updateResults: [[], [], []],
      });

      service = new WorkflowSleeperService(mockRedpanda as any, mockDb as any);

      await service.sweep();

      expect(mockRedpanda.publish).toHaveBeenCalledTimes(3);
      expect(mockDb.update).toHaveBeenCalledTimes(3);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobExecutorService } from './job-executor.service';
import type { JobTriggerEvent } from '../redpanda/redpanda.interfaces';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMockRedpanda() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeJob(overrides: Record<string, any> = {}) {
  return {
    id: 'job-1',
    name: 'Test Job',
    slug: 'test-job',
    schedule: '*/5 * * * *',
    timezone: 'UTC',
    status: 'active',
    maxRetries: 0,
    retryDelaySeconds: 60,
    retryBackoffMultiplier: 2,
    retryMaxDelaySeconds: 3600,
    concurrencyLimit: 1,
    concurrencyPolicy: 'queue',
    monitorId: null,
    ...overrides,
  };
}

function fakeEvent(overrides: Partial<JobTriggerEvent> = {}): JobTriggerEvent {
  return {
    jobId: 'job-1',
    runId: 'run-1',
    trigger: 'manual',
    scheduledAt: new Date().toISOString(),
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

  function makeChain(queue: unknown[][]) {
    const result = queue.shift() ?? [];
    const chain: Record<string, any> = {};
    const methods = ['from', 'where', 'set', 'values', 'limit', 'orderBy', 'offset', 'groupBy'];
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
    delete: vi.fn().mockImplementation(() => makeChain([])),
  };
}

function getExecute(service: JobExecutorService) {
  return (service as any).execute.bind(service);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('JobExecutorService', () => {
  let mockRedpanda: ReturnType<typeof makeMockRedpanda>;

  beforeEach(() => {
    mockRedpanda = makeMockRedpanda();
  });

  describe('onModuleInit', () => {
    it('subscribes to job-triggers topic', async () => {
      const mockDb = createMockDb({});
      const service = new JobExecutorService(mockRedpanda as any, mockDb as any);
      await service.onModuleInit();
      expect(mockRedpanda.subscribe).toHaveBeenCalledWith(
        'kast-job-executor',
        'job-triggers',
        expect.any(Function),
      );
    });
  });

  describe('job not found', () => {
    it('skips execution when job is not found', async () => {
      const mockDb = createMockDb({ selectResults: [[]] });
      const service = new JobExecutorService(mockRedpanda as any, mockDb as any);
      await getExecute(service)(fakeEvent());
      expect(mockRedpanda.publish).not.toHaveBeenCalled();
    });
  });

  describe('no workflow', () => {
    it('fails run when job has no workflow', async () => {
      const mockDb = createMockDb({
        selectResults: [
          [fakeJob()],           // job found
          [{ runningCount: 0 }], // concurrency check
          [],                    // no workflow
        ],
        updateResults: [[]],
      });
      const service = new JobExecutorService(mockRedpanda as any, mockDb as any);
      await getExecute(service)(fakeEvent());

      // Should update run to failed
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('workflow delegation', () => {
    it('delegates to workflow engine when workflow exists', async () => {
      const mockDb = createMockDb({
        selectResults: [
          [fakeJob()],           // job found
          [{ runningCount: 0 }], // concurrency check
          [{ id: 'wf-1', jobId: 'job-1', version: 1, steps: { nodes: [], edges: [] } }], // workflow found
        ],
        insertResults: [
          [{ id: 'wfrun-1' }], // workflow run created
        ],
        updateResults: [[]],   // job run updated
      });
      const service = new JobExecutorService(mockRedpanda as any, mockDb as any);
      await getExecute(service)(fakeEvent());

      // Should publish workflow resume event
      expect(mockRedpanda.publish).toHaveBeenCalledWith(
        'workflow-resume',
        'wfrun-1',
        expect.objectContaining({ workflowRunId: 'wfrun-1', reason: 'initial' }),
      );
    });
  });

  describe('concurrency — skip policy', () => {
    it('cancels run when concurrency limit reached with skip policy', async () => {
      const mockDb = createMockDb({
        selectResults: [
          [fakeJob({ concurrencyPolicy: 'skip' })],
          [{ runningCount: 1 }], // at limit
        ],
        updateResults: [[]],
      });
      const service = new JobExecutorService(mockRedpanda as any, mockDb as any);
      await getExecute(service)(fakeEvent());

      // Should update run to cancelled
      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});

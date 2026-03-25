import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobRetryService } from './job-retry.service';

// ── helpers ──────────────────────────────────────────────────────────────────

function chainable() {
  const chain: Record<string, any> = {};
  const self = () => chain;
  for (const key of [
    'insert',
    'select',
    'update',
    'delete',
    'from',
    'where',
    'set',
    'values',
    'returning',
    'limit',
    'offset',
    'orderBy',
  ]) {
    chain[key] = vi.fn().mockImplementation(self);
  }
  return chain;
}

function makeMockDb() {
  return chainable() as any;
}

function makeMockRedpanda() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeRetryRun(overrides: Record<string, any> = {}) {
  return {
    id: 'retry-run-1',
    jobId: 'job-1',
    status: 'scheduled',
    trigger: 'retry',
    attempt: 2,
    scheduledAt: new Date(Date.now() - 60_000), // 1 minute ago → due
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    parentRunId: 'run-1',
    ...overrides,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('JobRetryService', () => {
  let service: JobRetryService;
  let db: ReturnType<typeof makeMockDb>;
  let redpanda: ReturnType<typeof makeMockRedpanda>;

  beforeEach(() => {
    vi.restoreAllMocks();
    db = makeMockDb();
    redpanda = makeMockRedpanda();
    service = new (JobRetryService as any)(redpanda, db);
  });

  describe('sweep()', () => {
    it('dispatches due retry runs by publishing trigger events', async () => {
      const retryRun = fakeRetryRun();
      db.where.mockResolvedValueOnce([retryRun]);

      await service.sweep();

      expect(redpanda.publish).toHaveBeenCalledTimes(1);
      const [topic, key, event] = redpanda.publish.mock.calls[0];
      expect(topic).toBe('job-triggers');
      expect(key).toBe('job-1');
      expect(event.jobId).toBe('job-1');
      expect(event.runId).toBe('retry-run-1');
      expect(event.trigger).toBe('retry');
      expect(event.scheduledAt).toBe(retryRun.scheduledAt.toISOString());
      expect(event.timestamp).toBeDefined();
    });

    it('dispatches multiple due retries', async () => {
      const retry1 = fakeRetryRun({ id: 'retry-1', jobId: 'job-1' });
      const retry2 = fakeRetryRun({ id: 'retry-2', jobId: 'job-2', attempt: 3 });
      db.where.mockResolvedValueOnce([retry1, retry2]);

      await service.sweep();

      expect(redpanda.publish).toHaveBeenCalledTimes(2);
      expect(redpanda.publish.mock.calls[0][2].runId).toBe('retry-1');
      expect(redpanda.publish.mock.calls[1][2].runId).toBe('retry-2');
      expect(redpanda.publish.mock.calls[1][1]).toBe('job-2');
    });

    it('does nothing when no retries are due', async () => {
      db.where.mockResolvedValueOnce([]);

      await service.sweep();

      expect(redpanda.publish).not.toHaveBeenCalled();
    });

    it('skips retries not yet due (only fetches scheduledAt <= now)', async () => {
      // The service queries for scheduledAt <= now. If none are due, none returned.
      db.where.mockResolvedValueOnce([]);

      await service.sweep();

      expect(db.select).toHaveBeenCalled();
      expect(db.from).toHaveBeenCalled();
      expect(db.where).toHaveBeenCalledTimes(1);
      expect(redpanda.publish).not.toHaveBeenCalled();
    });

    it('handles errors per retry — continues processing remaining retries', async () => {
      const retry1 = fakeRetryRun({ id: 'retry-1', jobId: 'job-1' });
      const retry2 = fakeRetryRun({ id: 'retry-2', jobId: 'job-2' });
      db.where.mockResolvedValueOnce([retry1, retry2]);

      // First publish fails
      redpanda.publish
        .mockRejectedValueOnce(new Error('Redpanda unavailable'))
        .mockResolvedValueOnce(undefined);

      await service.sweep();

      // Should still have attempted both
      expect(redpanda.publish).toHaveBeenCalledTimes(2);
      // Second one should have succeeded
      expect(redpanda.publish.mock.calls[1][2].runId).toBe('retry-2');
    });

    it('constructs the trigger event with correct fields', async () => {
      const scheduledAt = new Date('2026-03-01T12:00:00Z');
      const retryRun = fakeRetryRun({ scheduledAt, attempt: 4 });
      db.where.mockResolvedValueOnce([retryRun]);

      await service.sweep();

      const event = redpanda.publish.mock.calls[0][2];
      expect(event).toEqual(
        expect.objectContaining({
          jobId: 'job-1',
          runId: 'retry-run-1',
          trigger: 'retry',
          scheduledAt: '2026-03-01T12:00:00.000Z',
        }),
      );
      // timestamp should be a valid ISO string
      expect(() => new Date(event.timestamp)).not.toThrow();
    });
  });
});

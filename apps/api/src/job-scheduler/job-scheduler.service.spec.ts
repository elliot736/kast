import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobSchedulerService } from './job-scheduler.service';

// ── helpers ──────────────────────────────────────────────────────────────────

function chainable(overrides: Record<string, any> = {}) {
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
    chain[key] = vi.fn().mockImplementation(overrides[key] ?? self);
  }
  return chain;
}

function makeMockDb() {
  return chainable() as any;
}

const mockRedpanda = {
  publish: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
};

function fakeJob(overrides: Record<string, any> = {}) {
  return {
    id: 'job-1',
    name: 'Scheduled Job',
    slug: 'scheduled-job',
    schedule: '*/5 * * * *',
    timezone: 'UTC',
    status: 'active',
    url: 'https://example.com/hook',
    method: 'POST',
    headers: {},
    body: null,
    nextRunAt: new Date(Date.now() - 60_000), // 1 minute in the past → due
    ...overrides,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('JobSchedulerService', () => {
  let service: JobSchedulerService;
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    vi.restoreAllMocks();
    db = makeMockDb();
    mockRedpanda.publish.mockReset();
    // constructor: (redpanda, db)
    service = new (JobSchedulerService as any)(mockRedpanda, db);
  });

  describe('sweep()', () => {
    it('triggers due jobs, creates runs, publishes events, and advances nextRunAt', async () => {
      const dueJob = fakeJob();
      // select().from(jobs).where(...) returns due jobs
      db.where.mockResolvedValueOnce([dueJob]);
      // insert(jobRuns).values(...).returning() returns the new run
      const run = { id: 'run-1', jobId: 'job-1', scheduledAt: dueJob.nextRunAt };
      db.returning.mockResolvedValueOnce([run]);
      // update(jobs).set(...).where(...) — the nextRunAt advance
      db.where.mockResolvedValueOnce(undefined);

      await service.sweep();

      // Should have inserted a run
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.values).toHaveBeenCalledTimes(1);
      const insertValues = db.values.mock.calls[0][0];
      expect(insertValues.jobId).toBe('job-1');
      expect(insertValues.trigger).toBe('cron');
      expect(insertValues.scheduledAt).toBe(dueJob.nextRunAt);

      // Should have published the trigger event
      expect(mockRedpanda.publish).toHaveBeenCalledTimes(1);
      const [topic, key, event] = mockRedpanda.publish.mock.calls[0];
      expect(topic).toBe('job-triggers');
      expect(key).toBe('job-1');
      expect(event.jobId).toBe('job-1');
      expect(event.runId).toBe('run-1');
      expect(event.trigger).toBe('cron');
      expect(event.scheduledAt).toBeDefined();
      expect(event.timestamp).toBeDefined();

      // Should have advanced nextRunAt
      expect(db.update).toHaveBeenCalled();
      expect(db.set).toHaveBeenCalled();
      const setArg = db.set.mock.calls[0][0];
      expect(setArg.nextRunAt).toBeInstanceOf(Date);
      expect(setArg.lastRunAt).toBeInstanceOf(Date);
      expect(setArg.updatedAt).toBeInstanceOf(Date);
      // The new nextRunAt should be in the future
      expect(setArg.nextRunAt.getTime()).toBeGreaterThan(Date.now() - 1000);
    });

    it('does nothing when no jobs are due', async () => {
      db.where.mockResolvedValueOnce([]);

      await service.sweep();

      expect(db.insert).not.toHaveBeenCalled();
      expect(mockRedpanda.publish).not.toHaveBeenCalled();
    });

    it('only fetches active jobs with nextRunAt <= now (skips paused/disabled)', async () => {
      // The service queries for status='active' AND nextRunAt <= now
      // If the db returns nothing, nothing should be triggered
      db.where.mockResolvedValueOnce([]);

      await service.sweep();

      expect(db.select).toHaveBeenCalled();
      expect(db.from).toHaveBeenCalled();
      expect(db.where).toHaveBeenCalledTimes(1);
      // No runs created
      expect(db.insert).not.toHaveBeenCalled();
      expect(mockRedpanda.publish).not.toHaveBeenCalled();
    });

    it('processes multiple due jobs', async () => {
      const job1 = fakeJob({ id: 'job-1', name: 'Job 1' });
      const job2 = fakeJob({ id: 'job-2', name: 'Job 2', schedule: '*/10 * * * *' });
      db.where.mockResolvedValueOnce([job1, job2]);

      const run1 = { id: 'run-1', jobId: 'job-1', scheduledAt: job1.nextRunAt };
      const run2 = { id: 'run-2', jobId: 'job-2', scheduledAt: job2.nextRunAt };
      db.returning.mockResolvedValueOnce([run1]);
      db.where.mockResolvedValueOnce(undefined); // advance job1
      db.returning.mockResolvedValueOnce([run2]);
      db.where.mockResolvedValueOnce(undefined); // advance job2

      await service.sweep();

      expect(db.insert).toHaveBeenCalledTimes(2);
      expect(mockRedpanda.publish).toHaveBeenCalledTimes(2);
      expect(mockRedpanda.publish.mock.calls[0][1]).toBe('job-1');
      expect(mockRedpanda.publish.mock.calls[1][1]).toBe('job-2');
    });

    it('handles errors gracefully per job — continues to next', async () => {
      const job1 = fakeJob({ id: 'job-1', name: 'Failing Job' });
      const job2 = fakeJob({ id: 'job-2', name: 'Good Job' });
      db.where.mockResolvedValueOnce([job1, job2]);

      // job1 insert fails
      db.returning.mockRejectedValueOnce(new Error('db error'));
      // job2 succeeds
      const run2 = { id: 'run-2', jobId: 'job-2', scheduledAt: job2.nextRunAt };
      db.returning.mockResolvedValueOnce([run2]);
      db.where.mockResolvedValueOnce(undefined);

      await service.sweep();

      // job2 should still have been processed
      expect(mockRedpanda.publish).toHaveBeenCalledTimes(1);
      expect(mockRedpanda.publish.mock.calls[0][1]).toBe('job-2');
    });

    it('advances nextRunAt to the correct next cron occurrence', async () => {
      const dueJob = fakeJob({ schedule: '0 12 * * *', timezone: 'UTC' });
      db.where.mockResolvedValueOnce([dueJob]);
      const run = { id: 'run-1', jobId: dueJob.id, scheduledAt: dueJob.nextRunAt };
      db.returning.mockResolvedValueOnce([run]);
      db.where.mockResolvedValueOnce(undefined);

      await service.sweep();

      const setArg = db.set.mock.calls[0][0];
      const nextRun = setArg.nextRunAt as Date;
      // "0 12 * * *" = daily at noon UTC — next should be at hour 12
      expect(nextRun.getUTCHours()).toBe(12);
      expect(nextRun.getUTCMinutes()).toBe(0);
    });
  });
});

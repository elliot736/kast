import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { JobService } from './job.service';

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

function makeMockDb(overrides: Record<string, any> = {}) {
  const db = chainable(overrides);
  return db as any;
}

const mockRedpanda = {
  publish: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
};

// ── factory ──────────────────────────────────────────────────────────────────

function fakeJob(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'job-1',
    name: 'My Job',
    slug: 'my-job',
    description: null,
    schedule: '*/5 * * * *',
    timezone: 'UTC',
    status: 'active',
    url: 'https://example.com/hook',
    method: 'POST',
    headers: {},
    body: null,
    timeoutSeconds: 30,
    maxRetries: 0,
    retryDelaySeconds: 60,
    retryBackoffMultiplier: 2,
    retryMaxDelaySeconds: 3600,
    concurrencyLimit: 1,
    concurrencyPolicy: 'queue',
    successStatusCodes: [200, 201, 202, 204],
    monitorId: null,
    teamId: 'team-1',
    tags: ['backend'],
    nextRunAt: new Date('2026-01-01T00:05:00Z'),
    lastRunAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function fakeRun(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'run-1',
    jobId: 'job-1',
    status: 'scheduled',
    trigger: 'manual',
    scheduledAt: new Date(),
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    httpStatus: null,
    responseBody: null,
    errorMessage: null,
    attempt: 1,
    queuedAt: null,
    parentRunId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('JobService', () => {
  let service: JobService;
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    vi.restoreAllMocks();
    db = makeMockDb();
    mockRedpanda.publish.mockReset();
    service = new (JobService as any)(db, mockRedpanda);
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('inserts a job and returns it', async () => {
      const created = fakeJob();
      db.returning.mockResolvedValue([created]);

      const dto = {
        name: 'My Job',
        slug: 'my-job',
        schedule: '*/5 * * * *',
        timezone: 'UTC',
        url: 'https://example.com/hook',
        method: 'POST' as const,
        headers: {},
        timeoutSeconds: 30,
        maxRetries: 0,
        retryDelaySeconds: 60,
        retryBackoffMultiplier: 2,
        retryMaxDelaySeconds: 3600,
        concurrencyLimit: 1,
        concurrencyPolicy: 'queue' as const,
        successStatusCodes: [200, 201, 202, 204],
        teamId: 'team-1',
        tags: ['backend'],
      };

      const result = await service.create(dto as any);

      expect(result).toBe(created);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.values).toHaveBeenCalledTimes(1);

      // Ensure nextRunAt was computed (should be a Date)
      const valuesArg = db.values.mock.calls[0][0];
      expect(valuesArg.nextRunAt).toBeInstanceOf(Date);
      expect(valuesArg.name).toBe('My Job');
      expect(valuesArg.schedule).toBe('*/5 * * * *');
    });

    it('computes nextRunAt from cron schedule', async () => {
      db.returning.mockResolvedValue([fakeJob()]);

      await service.create({
        name: 'Every Minute',
        slug: 'every-minute',
        schedule: '* * * * *',
        timezone: 'UTC',
        url: 'https://example.com',
        method: 'POST',
        headers: {},
        timeoutSeconds: 30,
        maxRetries: 0,
        retryDelaySeconds: 60,
        retryBackoffMultiplier: 2,
        retryMaxDelaySeconds: 3600,
        concurrencyLimit: 1,
        concurrencyPolicy: 'queue',
        successStatusCodes: [200],
        tags: [],
      } as any);

      const valuesArg = db.values.mock.calls[0][0];
      expect(valuesArg.nextRunAt).toBeInstanceOf(Date);
      // For a "* * * * *" cron, nextRunAt should be within 60 seconds from now
      const diff = valuesArg.nextRunAt.getTime() - Date.now();
      expect(diff).toBeGreaterThan(0);
      expect(diff).toBeLessThanOrEqual(60_000);
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns all jobs when no filters', async () => {
      const jobList = [fakeJob(), fakeJob({ id: 'job-2' })];
      // For the no-filter path the chain ends at .from(jobs)
      db.from.mockResolvedValue(jobList);

      const result = await service.findAll();
      expect(result).toBe(jobList);
      expect(db.select).toHaveBeenCalled();
      expect(db.from).toHaveBeenCalled();
    });

    it('applies status filter', async () => {
      db.where.mockResolvedValue([fakeJob()]);

      const result = await service.findAll({ status: 'active' });
      expect(result).toEqual([fakeJob()]);
      expect(db.where).toHaveBeenCalled();
    });

    it('applies teamId filter', async () => {
      db.where.mockResolvedValue([]);

      const result = await service.findAll({ teamId: 'team-99' });
      expect(result).toEqual([]);
      expect(db.where).toHaveBeenCalled();
    });

    it('applies tag filter', async () => {
      db.where.mockResolvedValue([fakeJob()]);

      const result = await service.findAll({ tag: 'backend' });
      expect(result).toEqual([fakeJob()]);
      expect(db.where).toHaveBeenCalled();
    });

    it('applies multiple filters', async () => {
      db.where.mockResolvedValue([]);

      await service.findAll({ status: 'paused', teamId: 'team-1', tag: 'api' });
      expect(db.where).toHaveBeenCalled();
    });
  });

  // ── findById ─────────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('returns the job when found', async () => {
      const job = fakeJob();
      db.limit.mockResolvedValue([job]);

      const result = await service.findById('job-1');
      expect(result).toBe(job);
      expect(db.select).toHaveBeenCalled();
      expect(db.where).toHaveBeenCalled();
      expect(db.limit).toHaveBeenCalledWith(1);
    });

    it('throws NotFoundException when not found', async () => {
      db.limit.mockResolvedValue([]);

      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates a job and returns it', async () => {
      const updated = fakeJob({ name: 'Updated' });
      db.returning.mockResolvedValue([updated]);

      const result = await service.update('job-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
      expect(db.update).toHaveBeenCalled();
      expect(db.set).toHaveBeenCalled();
    });

    it('recomputes nextRunAt when schedule changes', async () => {
      // findById for the current job
      const current = fakeJob({ schedule: '*/5 * * * *' });
      db.limit.mockResolvedValueOnce([current]);
      const updated = fakeJob({ schedule: '*/10 * * * *' });
      db.returning.mockResolvedValue([updated]);

      const result = await service.update('job-1', { schedule: '*/10 * * * *' });
      expect(result).toBe(updated);

      const setArg = db.set.mock.calls[0][0];
      expect(setArg.nextRunAt).toBeInstanceOf(Date);
    });

    it('recomputes nextRunAt when timezone changes', async () => {
      const current = fakeJob();
      db.limit.mockResolvedValueOnce([current]);
      const updated = fakeJob({ timezone: 'America/New_York' });
      db.returning.mockResolvedValue([updated]);

      await service.update('job-1', { timezone: 'America/New_York' });
      const setArg = db.set.mock.calls[0][0];
      expect(setArg.nextRunAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when job not found for update', async () => {
      db.returning.mockResolvedValue([]);

      await expect(service.update('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── delete ───────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('deletes the job', async () => {
      db.returning.mockResolvedValue([{ id: 'job-1' }]);

      await expect(service.delete('job-1')).resolves.toBeUndefined();
      expect(db.delete).toHaveBeenCalled();
    });

    it('throws NotFoundException when job not found', async () => {
      db.returning.mockResolvedValue([]);

      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── pause / resume ───────────────────────────────────────────────────────

  describe('pause()', () => {
    it('sets status to paused', async () => {
      const paused = fakeJob({ status: 'paused' });
      db.returning.mockResolvedValue([paused]);

      const result = await service.pause('job-1');
      expect(result.status).toBe('paused');
      expect(db.set).toHaveBeenCalled();
      const setArg = db.set.mock.calls[0][0];
      expect(setArg.status).toBe('paused');
    });

    it('throws NotFoundException when job not found', async () => {
      db.returning.mockResolvedValue([]);

      await expect(service.pause('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resume()', () => {
    it('sets status to active and recomputes nextRunAt', async () => {
      const current = fakeJob({ status: 'paused' });
      db.limit.mockResolvedValueOnce([current]);
      const resumed = fakeJob({ status: 'active' });
      db.returning.mockResolvedValue([resumed]);

      const result = await service.resume('job-1');
      expect(result.status).toBe('active');
      const setArg = db.set.mock.calls[0][0];
      expect(setArg.status).toBe('active');
      expect(setArg.nextRunAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when findById fails', async () => {
      db.limit.mockResolvedValue([]);

      await expect(service.resume('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── trigger ──────────────────────────────────────────────────────────────

  describe('trigger()', () => {
    it('creates a manual run and publishes trigger event', async () => {
      const job = fakeJob();
      db.limit.mockResolvedValueOnce([job]);
      const run = fakeRun();
      db.returning.mockResolvedValue([run]);

      const result = await service.trigger('job-1');
      expect(result).toBe(run);
      expect(db.insert).toHaveBeenCalled();

      const valuesArg = db.values.mock.calls[0][0];
      expect(valuesArg.trigger).toBe('manual');
      expect(valuesArg.jobId).toBe('job-1');

      expect(mockRedpanda.publish).toHaveBeenCalledTimes(1);
      const [topic, key, event] = mockRedpanda.publish.mock.calls[0];
      expect(topic).toBe('job-triggers');
      expect(key).toBe('job-1');
      expect(event.jobId).toBe('job-1');
      expect(event.runId).toBe('run-1');
      expect(event.trigger).toBe('manual');
      expect(event.scheduledAt).toBeDefined();
      expect(event.timestamp).toBeDefined();
    });

    it('throws NotFoundException when job not found', async () => {
      db.limit.mockResolvedValue([]);

      await expect(service.trigger('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getRuns ──────────────────────────────────────────────────────────────

  describe('getRuns()', () => {
    it('returns paginated runs with defaults', async () => {
      const runs = [fakeRun()];
      db.offset.mockResolvedValue(runs);

      const result = await service.getRuns('job-1');
      expect(result).toBe(runs);
      expect(db.limit).toHaveBeenCalledWith(50);
      expect(db.offset).toHaveBeenCalledWith(0);
    });

    it('applies custom pagination', async () => {
      db.offset.mockResolvedValue([]);

      await service.getRuns('job-1', { limit: 10, offset: 20 });
      expect(db.limit).toHaveBeenCalledWith(10);
      expect(db.offset).toHaveBeenCalledWith(20);
    });

    it('filters by status', async () => {
      db.offset.mockResolvedValue([]);

      await service.getRuns('job-1', { status: 'running' });
      expect(db.where).toHaveBeenCalled();
    });
  });

  // ── getRunLogs ───────────────────────────────────────────────────────────

  describe('getRunLogs()', () => {
    it('returns paginated logs with defaults', async () => {
      const logs = [{ id: 'log-1', message: 'hello' }];
      db.offset.mockResolvedValue(logs);

      const result = await service.getRunLogs('run-1');
      expect(result).toBe(logs);
      expect(db.limit).toHaveBeenCalledWith(100);
      expect(db.offset).toHaveBeenCalledWith(0);
    });

    it('filters by level', async () => {
      db.offset.mockResolvedValue([]);

      await service.getRunLogs('run-1', { level: 'error' });
      expect(db.where).toHaveBeenCalled();
    });

    it('applies custom pagination for logs', async () => {
      db.offset.mockResolvedValue([]);

      await service.getRunLogs('run-1', { limit: 25, offset: 50 });
      expect(db.limit).toHaveBeenCalledWith(25);
      expect(db.offset).toHaveBeenCalledWith(50);
    });
  });

  // ── cancelRun ────────────────────────────────────────────────────────────

  describe('cancelRun()', () => {
    it('cancels the run and returns it', async () => {
      const cancelled = fakeRun({ status: 'cancelled' });
      db.returning.mockResolvedValue([cancelled]);

      const result = await service.cancelRun('job-1', 'run-1');
      expect(result.status).toBe('cancelled');
      expect(db.update).toHaveBeenCalled();
      const setArg = db.set.mock.calls[0][0];
      expect(setArg.status).toBe('cancelled');
      expect(setArg.errorMessage).toBe('Cancelled by user');
      expect(setArg.finishedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when run not found', async () => {
      db.returning.mockResolvedValue([]);

      await expect(service.cancelRun('job-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getStats ─────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('returns aggregated run stats', async () => {
      const job = fakeJob();
      // findById: select().from().where().limit(1)
      // where() must return chain (so .limit() works), limit() resolves to [job]
      db.where.mockReturnValueOnce(db); // return chain for findById
      db.limit.mockResolvedValueOnce([job]);
      // stats query: select({}).from().where() — where is terminal here
      db.where.mockResolvedValueOnce([
        {
          total: 100,
          successes: 85,
          failures: 10,
          timeouts: 3,
          retries: 2,
          avgDuration: 1234.5,
        },
      ]);

      const result = await service.getStats('job-1');

      expect(result.jobId).toBe('job-1');
      expect(result.period).toBe('30d');
      expect(result.runs.total).toBe(100);
      expect(result.runs.successes).toBe(85);
      expect(result.runs.failures).toBe(10);
      expect(result.runs.timeouts).toBe(3);
      expect(result.runs.retries).toBe(2);
      expect(result.runs.successRate).toBe(85);
      expect(result.avgDurationMs).toBe(1235);
      expect(result.status).toBe('active');
    });

    it('returns 100% success rate when no runs', async () => {
      const job = fakeJob();
      db.where.mockReturnValueOnce(db);
      db.limit.mockResolvedValueOnce([job]);
      db.where.mockResolvedValueOnce([
        {
          total: 0,
          successes: 0,
          failures: 0,
          timeouts: 0,
          retries: 0,
          avgDuration: null,
        },
      ]);

      const result = await service.getStats('job-1');
      expect(result.runs.total).toBe(0);
      expect(result.runs.successRate).toBe(100);
      expect(result.avgDurationMs).toBeNull();
    });

    it('throws NotFoundException when job not found', async () => {
      db.limit.mockResolvedValue([]);

      await expect(service.getStats('missing')).rejects.toThrow(NotFoundException);
    });
  });
});

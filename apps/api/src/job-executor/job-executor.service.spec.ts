import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    ...overrides,
  };
}

function fakeEvent(overrides: Partial<JobTriggerEvent> = {}): JobTriggerEvent {
  return {
    jobId: 'job-1',
    runId: 'run-1',
    trigger: 'cron',
    scheduledAt: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function fakeRun(overrides: Record<string, any> = {}) {
  return {
    id: 'run-1',
    jobId: 'job-1',
    status: 'scheduled',
    trigger: 'cron',
    attempt: 1,
    scheduledAt: new Date(),
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    ...overrides,
  };
}

// ── mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

// ── tests ────────────────────────────────────────────────────────────────────

// (tests below use a thenable chain mock)

// ────────────────────────────────────────────────────────────────────────────
// Redesigned with thenable chain
// ────────────────────────────────────────────────────────────────────────────

describe('JobExecutorService', () => {
  let service: JobExecutorService;
  let db: any;
  let redpanda: ReturnType<typeof makeMockRedpanda>;
  let originalFetch: typeof globalThis.fetch;

  // Queues for terminal results
  let limitQueue: any[];
  let returningQueue: any[];
  let thenQueue: any[];

  beforeEach(() => {
    vi.restoreAllMocks();
    redpanda = makeMockRedpanda();

    limitQueue = [];
    returningQueue = [];
    thenQueue = [];

    const chain: any = {};
    const self = (..._args: any[]) => chain;

    chain.select = vi.fn(self);
    chain.insert = vi.fn(self);
    chain.update = vi.fn(self);
    chain.delete = vi.fn(self);
    chain.from = vi.fn(self);
    chain.set = vi.fn(self);
    chain.values = vi.fn(self);
    chain.orderBy = vi.fn(self);
    chain.offset = vi.fn(self);
    chain.where = vi.fn(self);

    chain.limit = vi.fn((..._args: any[]) => {
      if (limitQueue.length > 0) {
        return limitQueue.shift();
      }
      return chain;
    });

    chain.returning = vi.fn((..._args: any[]) => {
      if (returningQueue.length > 0) {
        return returningQueue.shift();
      }
      return chain;
    });

    // Make chain thenable — when awaited directly (no .limit()/.returning()),
    // resolve from thenQueue. This handles cases like `await db.select().from().where()`.
    chain.then = function (resolve: any, reject: any) {
      if (thenQueue.length > 0) {
        return Promise.resolve(thenQueue.shift()).then(resolve, reject);
      }
      // Default: resolve with empty
      return Promise.resolve([]).then(resolve, reject);
    };

    db = chain;
    service = new (JobExecutorService as any)(redpanda, db);

    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as any;
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function callExecute(event: JobTriggerEvent) {
    return (service as any).execute(event);
  }

  // Helper: set up mocks for standard successful execution (no workflow)
  function setupSuccessfulExecution(job = fakeJob()) {
    // 1. select job: select().from(jobs).where().limit(1) → limitQueue
    limitQueue.push(Promise.resolve([job]));
    // 2. concurrency check: select({}).from(jobRuns).where() → thenQueue (awaited directly)
    thenQueue.push([{ runningCount: 0 }]);
    // 3. workflow check: select().from(workflows).where().orderBy().limit(1) → limitQueue
    limitQueue.push(Promise.resolve([]));
    // 4. emitLog (Execution started) — publish (no db)
    // 5. mark running: update().set().where() → thenQueue
    thenQueue.push(undefined);
    // After fetch:
    // 6. update run with results: update().set().where() → thenQueue
    thenQueue.push(undefined);
    // 7. result publish — no db
    // 8. emitLog — no db
  }

  // ── successful HTTP execution ────────────────────────────────────────────

  describe('successful HTTP execution', () => {
    it('makes HTTP request, marks run as success, publishes result', async () => {
      setupSuccessfulExecution();
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });

      await callExecute(fakeEvent());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.com/hook');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['User-Agent']).toBe('Kast/1.0');

      // Verify result was published
      const resultCall = redpanda.publish.mock.calls.find(
        (c: any[]) => c[0] === 'job-results',
      );
      expect(resultCall).toBeDefined();
      expect(resultCall![2].status).toBe('success');
      expect(resultCall![2].httpStatus).toBe(200);
      expect(resultCall![2].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── failed HTTP ──────────────────────────────────────────────────────────

  describe('failed HTTP execution', () => {
    it('marks run as failed when status code not in successStatusCodes', async () => {
      setupSuccessfulExecution(fakeJob({ successStatusCodes: [200] }));
      mockFetch.mockResolvedValueOnce({
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      });

      await callExecute(fakeEvent());

      const resultCall = redpanda.publish.mock.calls.find(
        (c: any[]) => c[0] === 'job-results',
      );
      expect(resultCall).toBeDefined();
      expect(resultCall![2].status).toBe('failed');
      expect(resultCall![2].httpStatus).toBe(500);
      expect(resultCall![2].errorMessage).toContain('HTTP 500');
    });

    it('marks 404 as failed when not in successStatusCodes', async () => {
      setupSuccessfulExecution(fakeJob({ successStatusCodes: [200, 201] }));
      mockFetch.mockResolvedValueOnce({
        status: 404,
        text: vi.fn().mockResolvedValue('Not Found'),
      });

      await callExecute(fakeEvent());

      const resultCall = redpanda.publish.mock.calls.find(
        (c: any[]) => c[0] === 'job-results',
      );
      expect(resultCall![2].status).toBe('failed');
      expect(resultCall![2].httpStatus).toBe(404);
    });
  });

  // ── timeout handling ─────────────────────────────────────────────────────

  describe('timeout handling', () => {
    it('marks run as timeout when AbortError', async () => {
      setupSuccessfulExecution(fakeJob({ timeoutSeconds: 5 }));

      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch.mockRejectedValueOnce(abortError);

      await callExecute(fakeEvent());

      const resultCall = redpanda.publish.mock.calls.find(
        (c: any[]) => c[0] === 'job-results',
      );
      expect(resultCall).toBeDefined();
      expect(resultCall![2].status).toBe('timeout');
      expect(resultCall![2].errorMessage).toContain('timed out');
    });
  });

  // ── concurrency: skip policy ─────────────────────────────────────────────

  describe('concurrency — skip policy', () => {
    it('cancels run when concurrency limit reached and policy is skip', async () => {
      const job = fakeJob({ concurrencyLimit: 1, concurrencyPolicy: 'skip' });
      // 1. select job
      limitQueue.push(Promise.resolve([job]));
      // 2. concurrency: running count = 1 (at limit)
      thenQueue.push([{ runningCount: 1 }]);
      // 3. emitLog (concurrency warn) — publish only
      // 4. skip: update run to cancelled — where terminal
      thenQueue.push(undefined);

      await callExecute(fakeEvent());

      expect(mockFetch).not.toHaveBeenCalled();

      const setArg = db.set.mock.calls.find(
        (c: any[]) => c[0].status === 'cancelled',
      );
      expect(setArg).toBeDefined();
      expect(setArg![0].errorMessage).toContain('Skipped');
    });
  });

  // ── concurrency: cancel policy ───────────────────────────────────────────

  describe('concurrency — cancel policy', () => {
    it('cancels the oldest running run when policy is cancel', async () => {
      const job = fakeJob({ concurrencyLimit: 1, concurrencyPolicy: 'cancel' });
      // 1. select job
      limitQueue.push(Promise.resolve([job]));
      // 2. concurrency: running count = 1
      thenQueue.push([{ runningCount: 1 }]);
      // 3. emitLog — publish only
      // 4. find oldest running: select().from().where().orderBy().limit(1)
      limitQueue.push(Promise.resolve([{ id: 'oldest-run' }]));
      // 5. cancel oldest: update().set().where()
      thenQueue.push(undefined);
      // 6. emitLog for oldest — publish only
      // After checkConcurrency returns true, execution continues:
      // 7. workflow check: select().from().where().orderBy().limit(1)
      limitQueue.push(Promise.resolve([]));
      // 8. emitLog (execution started)
      // 9. mark running: update().set().where()
      thenQueue.push(undefined);

      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });

      // 10. update run results
      thenQueue.push(undefined);

      await callExecute(fakeEvent());

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const cancelSet = db.set.mock.calls.find(
        (c: any[]) => c[0].errorMessage === 'Cancelled: newer run took its slot',
      );
      expect(cancelSet).toBeDefined();
      expect(cancelSet![0].status).toBe('cancelled');
    });
  });

  // ── concurrency: queue policy ────────────────────────────────────────────

  describe('concurrency — queue policy', () => {
    it('queues the run when concurrency limit reached and policy is queue', async () => {
      const job = fakeJob({ concurrencyLimit: 1, concurrencyPolicy: 'queue' });
      // 1. select job
      limitQueue.push(Promise.resolve([job]));
      // 2. concurrency: running = 1
      thenQueue.push([{ runningCount: 1 }]);
      // 3. emitLog
      // 4. queue: update run with queuedAt
      thenQueue.push(undefined);
      // 5. emitLog

      await callExecute(fakeEvent());

      expect(mockFetch).not.toHaveBeenCalled();

      const queueSet = db.set.mock.calls.find(
        (c: any[]) => c[0].queuedAt instanceof Date,
      );
      expect(queueSet).toBeDefined();

      const logCalls = redpanda.publish.mock.calls.filter(
        (c: any[]) => c[0] === 'job-run-logs',
      );
      const queueLog = logCalls.find(
        (c: any[]) => c[2].message?.includes('queued'),
      );
      expect(queueLog).toBeDefined();
    });
  });

  // ── retry scheduling on failure ──────────────────────────────────────────

  describe('retry scheduling on failure', () => {
    it('creates a retry run and publishes job-retry-scheduled when maxRetries > 0', async () => {
      const job = fakeJob({
        maxRetries: 3,
        retryDelaySeconds: 10,
        retryBackoffMultiplier: 2,
        retryMaxDelaySeconds: 3600,
      });
      // 1. select job
      limitQueue.push(Promise.resolve([job]));
      // 2. concurrency ok
      thenQueue.push([{ runningCount: 0 }]);
      // 3. no workflow
      limitQueue.push(Promise.resolve([]));
      // 4. mark running
      thenQueue.push(undefined);

      mockFetch.mockResolvedValueOnce({
        status: 500,
        text: vi.fn().mockResolvedValue('Error'),
      });

      // 5. update run results
      thenQueue.push(undefined);
      // 6. scheduleRetry: get current run
      limitQueue.push(Promise.resolve([fakeRun({ attempt: 1 })]));
      // 7. insert retry run
      returningQueue.push(Promise.resolve([fakeRun({ id: 'retry-run-1', trigger: 'retry', attempt: 2 })]));

      await callExecute(fakeEvent());

      const retryCall = redpanda.publish.mock.calls.find(
        (c: any[]) => c[0] === 'job-retry-scheduled',
      );
      expect(retryCall).toBeDefined();
      expect(retryCall![2].attempt).toBe(2);
      expect(retryCall![2].originalRunId).toBe('run-1');
      expect(retryCall![2].newRunId).toBe('retry-run-1');
      expect(retryCall![2].delayMs).toBe(10_000);
    });

    it('does not retry when maxRetries=0', async () => {
      setupSuccessfulExecution(fakeJob({ maxRetries: 0 }));
      mockFetch.mockResolvedValueOnce({
        status: 500,
        text: vi.fn().mockResolvedValue('Error'),
      });

      await callExecute(fakeEvent());

      const retryCall = redpanda.publish.mock.calls.find(
        (c: any[]) => c[0] === 'job-retry-scheduled',
      );
      expect(retryCall).toBeUndefined();
    });

    it('does not retry when max retries already reached', async () => {
      const job = fakeJob({ maxRetries: 2 });
      // 1. select job
      limitQueue.push(Promise.resolve([job]));
      // 2. concurrency ok
      thenQueue.push([{ runningCount: 0 }]);
      // 3. no workflow
      limitQueue.push(Promise.resolve([]));
      // 4. mark running
      thenQueue.push(undefined);

      mockFetch.mockResolvedValueOnce({
        status: 500,
        text: vi.fn().mockResolvedValue('Error'),
      });

      // 5. update run results
      thenQueue.push(undefined);
      // 6. get current run — attempt=3 which exceeds maxRetries=2
      limitQueue.push(Promise.resolve([fakeRun({ attempt: 3 })]));

      await callExecute(fakeEvent());

      const retryCall = redpanda.publish.mock.calls.find(
        (c: any[]) => c[0] === 'job-retry-scheduled',
      );
      expect(retryCall).toBeUndefined();

      // Should log that max retries reached
      const logCalls = redpanda.publish.mock.calls.filter(
        (c: any[]) => c[0] === 'job-run-logs',
      );
      const maxRetriesLog = logCalls.find(
        (c: any[]) => c[2].message?.includes('Max retries reached'),
      );
      expect(maxRetriesLog).toBeDefined();
    });

    it('applies exponential backoff for retries', async () => {
      const job = fakeJob({
        maxRetries: 5,
        retryDelaySeconds: 10,
        retryBackoffMultiplier: 2,
        retryMaxDelaySeconds: 3600,
      });
      limitQueue.push(Promise.resolve([job]));
      thenQueue.push([{ runningCount: 0 }]);
      limitQueue.push(Promise.resolve([]));
      thenQueue.push(undefined);

      mockFetch.mockResolvedValueOnce({
        status: 500,
        text: vi.fn().mockResolvedValue('Error'),
      });

      thenQueue.push(undefined);
      // attempt=3 → delay = 10000 * 2^(3-1) = 40000ms
      limitQueue.push(Promise.resolve([fakeRun({ attempt: 3 })]));
      returningQueue.push(Promise.resolve([fakeRun({ id: 'retry-run-3', attempt: 4 })]));

      await callExecute(fakeEvent());

      const retryCall = redpanda.publish.mock.calls.find(
        (c: any[]) => c[0] === 'job-retry-scheduled',
      );
      expect(retryCall).toBeDefined();
      expect(retryCall![2].delayMs).toBe(40_000);
      expect(retryCall![2].attempt).toBe(4);
    });
  });

  // ── workflow delegation ──────────────────────────────────────────────────

  describe('workflow delegation', () => {
    it('delegates to workflow engine when job has a workflow', async () => {
      const job = fakeJob();
      // 1. select job
      limitQueue.push(Promise.resolve([job]));
      // 2. concurrency ok
      thenQueue.push([{ runningCount: 0 }]);
      // 3. workflow found
      const workflow = { id: 'wf-1', jobId: 'job-1', version: 1, steps: [] };
      limitQueue.push(Promise.resolve([workflow]));
      // 4. emitLog — publish
      // 5. mark running
      thenQueue.push(undefined);
      // 6. insert workflow run
      const wfRun = { id: 'wfrun-1', workflowId: 'wf-1', jobRunId: 'run-1' };
      returningQueue.push(Promise.resolve([wfRun]));

      await callExecute(fakeEvent());

      expect(mockFetch).not.toHaveBeenCalled();

      const resumeCall = redpanda.publish.mock.calls.find(
        (c: any[]) => c[0] === 'workflow-resume',
      );
      expect(resumeCall).toBeDefined();
      expect(resumeCall![2].workflowRunId).toBe('wfrun-1');
      expect(resumeCall![2].reason).toBe('initial');

      const logCalls = redpanda.publish.mock.calls.filter(
        (c: any[]) => c[0] === 'job-run-logs',
      );
      const delegationLog = logCalls.find(
        (c: any[]) => c[2].message?.includes('Delegating to workflow'),
      );
      expect(delegationLog).toBeDefined();
    });
  });

  // ── log emission ─────────────────────────────────────────────────────────

  describe('log emission', () => {
    it('emits logs at key milestones during execution', async () => {
      setupSuccessfulExecution();
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });

      await callExecute(fakeEvent());

      const logCalls = redpanda.publish.mock.calls.filter(
        (c: any[]) => c[0] === 'job-run-logs',
      );

      expect(logCalls.length).toBeGreaterThanOrEqual(3);

      const messages = logCalls.map((c: any[]) => c[2].message);
      expect(messages.some((m: string) => m.includes('Execution started'))).toBe(true);
      expect(messages.some((m: string) => m.includes('Sending POST request'))).toBe(true);
      expect(messages.some((m: string) => m.includes('HTTP 200'))).toBe(true);
      expect(messages.some((m: string) => m.includes('Execution completed: success'))).toBe(true);

      for (const call of logCalls) {
        const logEvent = call[2];
        expect(logEvent.runId).toBe('run-1');
        expect(logEvent.jobId).toBe('job-1');
        expect(logEvent.timestamp).toBeDefined();
        expect(['info', 'warn', 'error', 'debug']).toContain(logEvent.level);
      }
    });
  });

  // ── body template interpolation ──────────────────────────────────────────

  describe('body template interpolation', () => {
    it('replaces {{run_id}} and {{scheduled_at}} in the body', async () => {
      const scheduledAt = '2026-01-01T00:00:00.000Z';
      setupSuccessfulExecution(
        fakeJob({ body: '{"runId":"{{run_id}}","at":"{{scheduled_at}}"}', method: 'POST' }),
      );
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });

      await callExecute(fakeEvent({ runId: 'my-run-id', scheduledAt }));

      const [, opts] = mockFetch.mock.calls[0];
      const parsedBody = JSON.parse(opts.body);
      expect(parsedBody.runId).toBe('my-run-id');
      expect(parsedBody.at).toBe(scheduledAt);
    });

    it('does not send body for GET requests', async () => {
      setupSuccessfulExecution(fakeJob({ body: '{"test": true}', method: 'GET' }));
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });

      await callExecute(fakeEvent());

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.body).toBeUndefined();
      expect(opts.method).toBe('GET');
    });
  });

  // ── job not found ────────────────────────────────────────────────────────

  describe('job not found', () => {
    it('returns early when job does not exist', async () => {
      limitQueue.push(Promise.resolve([]));

      await callExecute(fakeEvent());

      expect(mockFetch).not.toHaveBeenCalled();
      const resultCall = redpanda.publish.mock.calls.find(
        (c: any[]) => c[0] === 'job-results',
      );
      expect(resultCall).toBeUndefined();
    });
  });

  // ── general fetch error ──────────────────────────────────────────────────

  describe('general fetch error', () => {
    it('marks run as failed on network errors', async () => {
      setupSuccessfulExecution();
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await callExecute(fakeEvent());

      const resultCall = redpanda.publish.mock.calls.find(
        (c: any[]) => c[0] === 'job-results',
      );
      expect(resultCall).toBeDefined();
      expect(resultCall![2].status).toBe('failed');
      expect(resultCall![2].errorMessage).toContain('ECONNREFUSED');
    });
  });

  // ── concurrency under limit ──────────────────────────────────────────────

  describe('concurrency under limit', () => {
    it('proceeds when running count is below concurrency limit', async () => {
      const job = fakeJob({ concurrencyLimit: 5 });
      limitQueue.push(Promise.resolve([job]));
      thenQueue.push([{ runningCount: 3 }]); // 3 < 5
      limitQueue.push(Promise.resolve([])); // no workflow
      thenQueue.push(undefined); // mark running
      thenQueue.push(undefined); // update results

      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });

      await callExecute(fakeEvent());

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── custom headers ───────────────────────────────────────────────────────

  describe('custom headers', () => {
    it('merges custom headers with defaults', async () => {
      setupSuccessfulExecution(
        fakeJob({ headers: { Authorization: 'Bearer abc', 'X-Custom': 'value' } }),
      );
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });

      await callExecute(fakeEvent());

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toBe('Bearer abc');
      expect(opts.headers['X-Custom']).toBe('value');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['User-Agent']).toBe('Kast/1.0');
    });
  });
});

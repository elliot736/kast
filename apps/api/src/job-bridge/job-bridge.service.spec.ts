import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobBridgeService } from './job-bridge.service';
import type { JobResultEvent } from '../redpanda/redpanda.interfaces';

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

function fakeJob(overrides: Record<string, any> = {}) {
  return {
    id: 'job-1',
    name: 'My Job',
    monitorId: 'monitor-1',
    ...overrides,
  };
}

function fakeResultEvent(overrides: Partial<JobResultEvent> = {}): JobResultEvent {
  return {
    jobId: 'job-1',
    runId: 'run-1',
    status: 'success',
    httpStatus: 200,
    durationMs: 150,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('JobBridgeService', () => {
  let service: JobBridgeService;
  let db: ReturnType<typeof makeMockDb>;
  let redpanda: ReturnType<typeof makeMockRedpanda>;

  beforeEach(() => {
    vi.restoreAllMocks();
    db = makeMockDb();
    redpanda = makeMockRedpanda();
    service = new (JobBridgeService as any)(redpanda, db);
  });

  /** Helper to call the private bridge method */
  function callBridge(event: JobResultEvent) {
    return (service as any).bridge(event);
  }

  describe('bridge()', () => {
    it('publishes a success PingEvent when job has monitorId and result is success', async () => {
      const job = fakeJob({ monitorId: 'monitor-1' });
      db.limit.mockResolvedValueOnce([job]);

      await callBridge(fakeResultEvent({ status: 'success' }));

      expect(redpanda.publish).toHaveBeenCalledTimes(1);
      const [topic, key, event] = redpanda.publish.mock.calls[0];
      expect(topic).toBe('ping-events');
      expect(key).toBe('monitor-1');
      expect(event.monitorId).toBe('monitor-1');
      expect(event.type).toBe('success');
      expect(event.userAgent).toBe('Kast-JobBridge/1.0');
      expect(event.sourceIp).toBe('127.0.0.1');
      expect(event.timestamp).toBeDefined();
      expect(event.pingUuid).toBe('monitor-1');
      expect(event.body).toBeUndefined();
    });

    it('publishes a fail PingEvent when job has monitorId and result is failed', async () => {
      const job = fakeJob({ monitorId: 'monitor-1' });
      db.limit.mockResolvedValueOnce([job]);

      await callBridge(
        fakeResultEvent({
          status: 'failed',
          errorMessage: 'HTTP 500: Internal Server Error',
        }),
      );

      expect(redpanda.publish).toHaveBeenCalledTimes(1);
      const [topic, key, event] = redpanda.publish.mock.calls[0];
      expect(topic).toBe('ping-events');
      expect(key).toBe('monitor-1');
      expect(event.type).toBe('fail');
      expect(event.body).toBe('HTTP 500: Internal Server Error');
    });

    it('publishes a fail PingEvent when status is timeout', async () => {
      const job = fakeJob({ monitorId: 'monitor-1' });
      db.limit.mockResolvedValueOnce([job]);

      await callBridge(
        fakeResultEvent({
          status: 'timeout',
          errorMessage: 'Request timed out after 30s',
        }),
      );

      const [, , event] = redpanda.publish.mock.calls[0];
      expect(event.type).toBe('fail');
      expect(event.body).toBe('Request timed out after 30s');
    });

    it('does nothing when job has no monitorId', async () => {
      const job = fakeJob({ monitorId: null });
      db.limit.mockResolvedValueOnce([job]);

      await callBridge(fakeResultEvent());

      expect(redpanda.publish).not.toHaveBeenCalled();
    });

    it('does nothing when job is not found', async () => {
      db.limit.mockResolvedValueOnce([]);

      await callBridge(fakeResultEvent());

      expect(redpanda.publish).not.toHaveBeenCalled();
    });

    it('does nothing when job has undefined monitorId', async () => {
      const job = fakeJob({ monitorId: undefined });
      db.limit.mockResolvedValueOnce([job]);

      await callBridge(fakeResultEvent());

      expect(redpanda.publish).not.toHaveBeenCalled();
    });

    it('passes the correct timestamp from the result event', async () => {
      const job = fakeJob({ monitorId: 'monitor-1' });
      db.limit.mockResolvedValueOnce([job]);

      const ts = '2026-01-15T12:00:00.000Z';
      await callBridge(fakeResultEvent({ timestamp: ts }));

      const [, , event] = redpanda.publish.mock.calls[0];
      expect(event.timestamp).toBe(ts);
    });
  });
});

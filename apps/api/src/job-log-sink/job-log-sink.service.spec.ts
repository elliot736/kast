import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JobLogSinkService } from './job-log-sink.service';
import type { JobRunLogEvent } from '../redpanda/redpanda.interfaces';

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

function fakeLogEvent(overrides: Partial<JobRunLogEvent> = {}): JobRunLogEvent {
  return {
    runId: 'run-1',
    jobId: 'job-1',
    level: 'info',
    message: 'Test log message',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('JobLogSinkService', () => {
  let service: JobLogSinkService;
  let db: ReturnType<typeof makeMockDb>;
  let redpanda: ReturnType<typeof makeMockRedpanda>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    db = makeMockDb();
    redpanda = makeMockRedpanda();
    service = new (JobLogSinkService as any)(redpanda, db);
  });

  afterEach(() => {
    // Clean up interval if onModuleInit was called
    (service as any).onModuleDestroy?.().catch(() => {});
    vi.useRealTimers();
  });

  /** Access the private buffer */
  function getBuffer(): JobRunLogEvent[] {
    return (service as any).buffer;
  }

  /** Access the private flush method */
  function callFlush(): Promise<void> {
    return (service as any).flush();
  }

  describe('buffering', () => {
    it('starts with an empty buffer', () => {
      expect(getBuffer()).toEqual([]);
    });

    it('buffers log events', () => {
      const event1 = fakeLogEvent({ message: 'first' });
      const event2 = fakeLogEvent({ message: 'second' });
      getBuffer().push(event1, event2);

      expect(getBuffer()).toHaveLength(2);
      expect(getBuffer()[0].message).toBe('first');
      expect(getBuffer()[1].message).toBe('second');
    });
  });

  describe('flush()', () => {
    it('inserts buffered events into the database', async () => {
      const events = [
        fakeLogEvent({ message: 'log-1', level: 'info' }),
        fakeLogEvent({ message: 'log-2', level: 'error' }),
      ];
      getBuffer().push(...events);

      // db.insert().values() is the terminal call
      db.values.mockResolvedValueOnce(undefined);

      await callFlush();

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.values).toHaveBeenCalledTimes(1);

      const insertedValues = db.values.mock.calls[0][0];
      expect(insertedValues).toHaveLength(2);
      expect(insertedValues[0].runId).toBe('run-1');
      expect(insertedValues[0].level).toBe('info');
      expect(insertedValues[0].message).toBe('log-1');
      expect(insertedValues[0].timestamp).toBeInstanceOf(Date);
      expect(insertedValues[1].message).toBe('log-2');
      expect(insertedValues[1].level).toBe('error');

      // Buffer should be empty after flush
      expect(getBuffer()).toHaveLength(0);
    });

    it('does nothing when buffer is empty', async () => {
      await callFlush();

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('only flushes up to BATCH_SIZE events per call', async () => {
      // BATCH_SIZE is 50
      const events = Array.from({ length: 75 }, (_, i) =>
        fakeLogEvent({ message: `log-${i}` }),
      );
      getBuffer().push(...events);

      db.values.mockResolvedValueOnce(undefined);

      await callFlush();

      // Should have flushed 50 events
      const insertedValues = db.values.mock.calls[0][0];
      expect(insertedValues).toHaveLength(50);

      // 25 should remain in buffer
      expect(getBuffer()).toHaveLength(25);
      expect(getBuffer()[0].message).toBe('log-50');
    });

    it('re-queues events on database error', async () => {
      const events = [
        fakeLogEvent({ message: 'important-1' }),
        fakeLogEvent({ message: 'important-2' }),
      ];
      getBuffer().push(...events);

      // Simulate db failure
      db.values.mockRejectedValueOnce(new Error('Connection refused'));

      await callFlush();

      // Events should be put back in the buffer
      expect(getBuffer()).toHaveLength(2);
      expect(getBuffer()[0].message).toBe('important-1');
      expect(getBuffer()[1].message).toBe('important-2');
    });

    it('re-queues at the front of the buffer (preserving order)', async () => {
      const batch1 = [
        fakeLogEvent({ message: 'old-1' }),
        fakeLogEvent({ message: 'old-2' }),
      ];
      getBuffer().push(...batch1);

      // Add more events after the batch (simulates new events arriving)
      // We need to splice them in to simulate timing
      const newEvent = fakeLogEvent({ message: 'new-1' });

      // db fails for first flush
      db.values.mockRejectedValueOnce(new Error('Transient error'));

      await callFlush();

      // Now add the new event (arrived while flush was happening)
      getBuffer().push(newEvent);

      // Buffer should have old events at front, new at back
      expect(getBuffer()[0].message).toBe('old-1');
      expect(getBuffer()[1].message).toBe('old-2');
      expect(getBuffer()[2].message).toBe('new-1');
    });

    it('maps event fields correctly when inserting', async () => {
      const ts = '2026-03-15T14:30:00.000Z';
      const event = fakeLogEvent({
        runId: 'run-42',
        level: 'warn',
        message: 'High latency detected',
        metadata: { latencyMs: 5000 },
        timestamp: ts,
      });
      getBuffer().push(event);

      db.values.mockResolvedValueOnce(undefined);

      await callFlush();

      const row = db.values.mock.calls[0][0][0];
      expect(row.runId).toBe('run-42');
      expect(row.level).toBe('warn');
      expect(row.message).toBe('High latency detected');
      expect(row.metadata).toEqual({ latencyMs: 5000 });
      expect(row.timestamp).toEqual(new Date(ts));
    });
  });

  describe('flush on batch size reached (via onModuleInit consumer)', () => {
    it('flushes when buffer reaches BATCH_SIZE during message consumption', async () => {
      // Simulate what onModuleInit sets up: the subscribe callback
      // pushes to buffer and flushes if buffer.length >= 50
      let messageHandler: (msg: any) => Promise<void>;
      redpanda.subscribe.mockImplementation(async (_group: string, _topic: string, handler: any) => {
        messageHandler = handler;
      });

      await service.onModuleInit();

      db.values.mockResolvedValue(undefined);

      // Push 49 messages — should NOT flush yet
      for (let i = 0; i < 49; i++) {
        const event = fakeLogEvent({ message: `msg-${i}` });
        await messageHandler!({
          message: { value: Buffer.from(JSON.stringify(event)) },
        });
      }
      expect(db.insert).not.toHaveBeenCalled();

      // Push the 50th — should trigger flush
      const event50 = fakeLogEvent({ message: 'msg-49' });
      await messageHandler!({
        message: { value: Buffer.from(JSON.stringify(event50)) },
      });
      expect(db.insert).toHaveBeenCalledTimes(1);

      const insertedValues = db.values.mock.calls[0][0];
      expect(insertedValues).toHaveLength(50);
    });
  });

  describe('flush on interval', () => {
    it('flushes buffered events on the timer interval', async () => {
      let messageHandler: (msg: any) => Promise<void>;
      redpanda.subscribe.mockImplementation(async (_group: string, _topic: string, handler: any) => {
        messageHandler = handler;
      });

      db.values.mockResolvedValue(undefined);

      await service.onModuleInit();

      // Push a few events (below batch size)
      for (let i = 0; i < 5; i++) {
        const event = fakeLogEvent({ message: `timer-msg-${i}` });
        await messageHandler!({
          message: { value: Buffer.from(JSON.stringify(event)) },
        });
      }
      expect(db.insert).not.toHaveBeenCalled();

      // Advance timer by FLUSH_INTERVAL_MS (500ms)
      await vi.advanceTimersByTimeAsync(500);

      expect(db.insert).toHaveBeenCalledTimes(1);
      const insertedValues = db.values.mock.calls[0][0];
      expect(insertedValues).toHaveLength(5);
    });

    it('does not flush on interval when buffer is empty', async () => {
      redpanda.subscribe.mockResolvedValue(undefined);
      db.values.mockResolvedValue(undefined);

      await service.onModuleInit();

      // Advance timer
      await vi.advanceTimersByTimeAsync(500);

      // No insert because buffer is empty
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy()', () => {
    it('flushes remaining buffer on destroy', async () => {
      const events = [fakeLogEvent({ message: 'final-1' }), fakeLogEvent({ message: 'final-2' })];
      getBuffer().push(...events);

      db.values.mockResolvedValueOnce(undefined);

      await service.onModuleDestroy();

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.values.mock.calls[0][0]).toHaveLength(2);
      expect(getBuffer()).toHaveLength(0);
    });

    it('clears the flush timer on destroy', async () => {
      redpanda.subscribe.mockResolvedValue(undefined);
      await service.onModuleInit();

      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      await service.onModuleDestroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('does nothing special when buffer is empty on destroy', async () => {
      await service.onModuleDestroy();

      expect(db.insert).not.toHaveBeenCalled();
    });
  });
});

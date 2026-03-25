import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';

let apiKey: string;

test.describe('Replay', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('replay-test');
    apiKey = (await keyRes.json()).key;
  });

  test('create replay session', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const now = Date.now();
    const res = await client.createReplaySession({
      fromTimestamp: now - 3600_000, // 1 hour ago
      toTimestamp: now,
    });
    expect(res.ok()).toBeTruthy();
    const session = await res.json();
    expect(session.sessionId).toBeTruthy();
    expect(['running', 'completed']).toContain(session.status);
  });

  test('get replay session status', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const now = Date.now();
    const createRes = await client.createReplaySession({
      fromTimestamp: now - 3600_000,
      toTimestamp: now,
    });
    const { sessionId } = await createRes.json();

    // Wait a bit
    await new Promise((r) => setTimeout(r, 2000));

    const res = await client.getReplaySession(sessionId);
    expect(res.ok()).toBeTruthy();
    const session = await res.json();
    expect(session.id).toBe(sessionId);
    expect(session.eventCount).toBeGreaterThanOrEqual(0);
  });
});

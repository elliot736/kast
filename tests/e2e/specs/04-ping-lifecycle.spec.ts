import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';

let apiKey: string;
let monitorId: string;
let pingUuid: string;

test.describe('Ping lifecycle', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('ping-test');
    apiKey = (await keyRes.json()).key;

    const authClient = createApiClient(request, apiKey);
    const monRes = await authClient.createMonitor({
      name: 'Ping Test Monitor',
      slug: `ping-test-monitor-${Date.now()}`,
      intervalSeconds: 3600,
    });
    if (!monRes.ok()) {
      const err = await monRes.json();
      throw new Error(`Failed to create monitor: ${JSON.stringify(err)}`);
    }
    const monitor = await monRes.json();
    monitorId = monitor.id;
    pingUuid = monitor.pingUuid;
  });

  test('simple GET ping returns 202', async ({ request }) => {
    const client = createApiClient(request);
    const res = await client.sendPing(pingUuid);
    expect(res.status()).toBe(202);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('POST /start then /success', async ({ request }) => {
    const client = createApiClient(request);
    const startRes = await client.sendPing(pingUuid, 'start');
    expect(startRes.status()).toBe(202);

    // Small delay for start to be processed
    await new Promise((r) => setTimeout(r, 1000));

    const successRes = await client.sendPing(pingUuid, 'success');
    expect(successRes.status()).toBe(202);
  });

  test('POST /fail ping', async ({ request }) => {
    const client = createApiClient(request);
    const res = await client.sendPingWithBody(pingUuid, 'fail', 'Error: connection refused');
    expect(res.status()).toBe(202);
  });

  test('POST /log ping', async ({ request }) => {
    const client = createApiClient(request);
    const res = await client.sendPingWithBody(pingUuid, 'log', '{"level":"info","msg":"backup started"}');
    expect(res.status()).toBe(202);
  });

  test('ping history is persisted', async ({ request }) => {
    // Wait for sink to process
    await new Promise((r) => setTimeout(r, 3000));

    const client = createApiClient(request, apiKey);
    const res = await client.getMonitorPings(monitorId);
    expect(res.ok()).toBeTruthy();
    const pings = await res.json();
    expect(pings.length).toBeGreaterThanOrEqual(4); // start, success, fail, log + the initial GET
    expect(pings.some((p: any) => p.type === 'start')).toBeTruthy();
    expect(pings.some((p: any) => p.type === 'success')).toBeTruthy();
    expect(pings.some((p: any) => p.type === 'fail')).toBeTruthy();
    expect(pings.some((p: any) => p.type === 'log')).toBeTruthy();
  });

  test('monitor lastPingAt is updated', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.getMonitor(monitorId);
    expect(res.ok()).toBeTruthy();
    const monitor = await res.json();
    expect(monitor.lastPingAt).toBeTruthy();
  });

  test('invalid ping UUID returns 404', async ({ request }) => {
    const client = createApiClient(request);
    const res = await client.sendPing('00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(404);
  });
});

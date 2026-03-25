import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';

let apiKey: string;
let monitorId: string;
let pingUuid: string;

test.describe('Monitors CRUD', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('monitors-test');
    apiKey = (await keyRes.json()).key;

    // Create monitor in beforeAll so all tests can use it
    const authClient = createApiClient(request, apiKey);
    const res = await authClient.createMonitor({
      name: 'E2E Test Monitor',
      slug: `e2e-test-monitor-${Date.now()}`,
      schedule: '*/5 * * * *',
      graceSeconds: 60,
      tags: ['test', 'e2e'],
    });
    const monitor = await res.json();
    monitorId = monitor.id;
    pingUuid = monitor.pingUuid;
  });

  test('get monitor by ID', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.getMonitor(monitorId);
    expect(res.ok()).toBeTruthy();
    const monitor = await res.json();
    expect(monitor.id).toBe(monitorId);
    expect(monitor.name).toBe('E2E Test Monitor');
    expect(monitor.pingUuid).toBeTruthy();
    expect(monitor.status).toBe('healthy');
    expect(monitor.tags).toEqual(['test', 'e2e']);
  });

  test('update monitor', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.updateMonitor(monitorId, {
      name: 'Updated Monitor',
      graceSeconds: 120,
    });
    expect(res.ok()).toBeTruthy();
    const monitor = await res.json();
    expect(monitor.name).toBe('Updated Monitor');
    expect(monitor.graceSeconds).toBe(120);
  });

  test('list monitors', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.listMonitors();
    expect(res.ok()).toBeTruthy();
    const monitors = await res.json();
    expect(monitors.some((m: any) => m.id === monitorId)).toBeTruthy();
  });

  test('pause and resume monitor', async ({ request }) => {
    const client = createApiClient(request, apiKey);

    let res = await client.pauseMonitor(monitorId);
    expect(res.ok()).toBeTruthy();
    let monitor = await res.json();
    expect(monitor.status).toBe('paused');
    expect(monitor.isPaused).toBe(true);

    res = await client.resumeMonitor(monitorId);
    expect(res.ok()).toBeTruthy();
    monitor = await res.json();
    expect(monitor.status).toBe('healthy');
    expect(monitor.isPaused).toBe(false);
  });

  test('get monitor stats', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.getMonitorStats(monitorId);
    expect(res.ok()).toBeTruthy();
    const stats = await res.json();
    expect(stats.monitorId).toBe(monitorId);
    expect(stats.pings).toBeDefined();
    expect(stats.incidents).toBeDefined();
  });

  test('delete monitor', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    // Create a throwaway monitor to delete
    const createRes = await client.createMonitor({
      name: 'Delete Me',
      slug: `delete-me-${Date.now()}`,
    });
    const created = await createRes.json();

    const res = await client.deleteMonitor(created.id);
    expect(res.ok()).toBeTruthy();

    const getRes = await client.getMonitor(created.id);
    expect(getRes.status()).toBe(404);
  });
});

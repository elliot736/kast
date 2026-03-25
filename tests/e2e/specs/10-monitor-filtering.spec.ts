import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';

let apiKey: string;
let teamId: string;
let monitorIds: string[] = [];

test.describe('Monitor filtering', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('filter-test');
    apiKey = (await keyRes.json()).key;

    const authClient = createApiClient(request, apiKey);

    // Create a team
    const ts = Date.now();
    const teamRes = await authClient.createTeam({
      name: 'Filter Team',
      slug: `filter-team-${ts}`,
    });
    teamId = (await teamRes.json()).id;

    // Create monitors with different attributes
    const monitors = [
      { name: 'Prod Backup', slug: `prod-backup-${ts}`, tags: ['production', 'backup'], teamId },
      { name: 'Staging Sync', slug: `staging-sync-${ts}`, tags: ['staging', 'sync'] },
      { name: 'Dev Cleanup', slug: `dev-cleanup-${ts}`, tags: ['dev', 'cleanup'] },
    ];

    for (const m of monitors) {
      const res = await authClient.createMonitor(m);
      monitorIds.push((await res.json()).id);
    }

    // Pause one to create different statuses
    await authClient.pauseMonitor(monitorIds[2]);
  });

  test('filter by status=healthy', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.listMonitors({ status: 'healthy' });
    expect(res.ok()).toBeTruthy();
    const monitors = await res.json();
    expect(monitors.every((m: any) => m.status === 'healthy')).toBeTruthy();
  });

  test('filter by status=paused', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.listMonitors({ status: 'paused' });
    expect(res.ok()).toBeTruthy();
    const monitors = await res.json();
    expect(monitors.length).toBeGreaterThanOrEqual(1);
    expect(monitors.every((m: any) => m.status === 'paused')).toBeTruthy();
  });

  test('filter by tag', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.listMonitors({ tag: 'production' });
    expect(res.ok()).toBeTruthy();
    const monitors = await res.json();
    expect(monitors.length).toBeGreaterThanOrEqual(1);
    expect(monitors.every((m: any) => m.tags.includes('production'))).toBeTruthy();
  });

  test('filter by teamId', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.listMonitors({ teamId });
    expect(res.ok()).toBeTruthy();
    const monitors = await res.json();
    expect(monitors.length).toBeGreaterThanOrEqual(1);
    expect(monitors.every((m: any) => m.teamId === teamId)).toBeTruthy();
  });

  test('dashboard endpoint works', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.getDashboard();
    expect(res.ok()).toBeTruthy();
    const stats = await res.json();
    expect(stats.monitors.total).toBeGreaterThanOrEqual(3);
    expect(stats.monitors.healthy).toBeGreaterThanOrEqual(1);
    expect(typeof stats.openIncidents).toBe('number');
  });
});

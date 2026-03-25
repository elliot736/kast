import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';
import { waitForMonitorStatus, waitForIncident } from '../helpers/wait';

let apiKey: string;
let monitorId: string;
let pingUuid: string;

test.describe('Incidents', () => {
  test.setTimeout(180_000); // 3 min — sweep runs every 60s
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('incident-test');
    apiKey = (await keyRes.json()).key;

    const authClient = createApiClient(request, apiKey);
    // Create a monitor with tight timing for testing
    const monRes = await authClient.createMonitor({
      name: 'Incident Test Monitor',
      slug: `incident-test-monitor-${Date.now()}`,
      intervalSeconds: 5,
      graceSeconds: 5,
    });
    const monitor = await monRes.json();
    monitorId = monitor.id;
    pingUuid = monitor.pingUuid;

    // Send initial ping to set nextExpectedAt
    await createApiClient(request).sendPing(pingUuid);
    // Wait for processing
    await new Promise((r) => setTimeout(r, 3000));
  });

  test('monitor goes down after missed pings', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    // Wait for the sweep to detect the missed ping (60s sweep interval + grace)
    await waitForMonitorStatus(client, monitorId, 'down', 150_000);
  });

  test('incident is opened', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    await waitForIncident(client, monitorId, 'open', 150_000);

    const res = await client.listIncidents('open');
    expect(res.ok()).toBeTruthy();
    const incidents = await res.json();
    const incident = incidents.find((i: any) => i.monitorId === monitorId);
    expect(incident).toBeTruthy();
    expect(incident.status).toBe('open');
  });

  test('acknowledge incident', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const incRes = await client.listIncidents('open');
    const incidents = await incRes.json();
    const incident = incidents.find((i: any) => i.monitorId === monitorId);

    if (incident) {
      const ackRes = await client.acknowledgeIncident(incident.id, 'e2e-test');
      expect(ackRes.ok()).toBeTruthy();
      const acked = await ackRes.json();
      expect(acked.status).toBe('acknowledged');
      expect(acked.acknowledgedBy).toBe('e2e-test');
    }
  });

  test('ping resolves incident', async ({ request }) => {
    // Send a success ping to auto-resolve
    const client = createApiClient(request);
    await client.sendPing(pingUuid, 'success');

    // Wait for processing
    await new Promise((r) => setTimeout(r, 5000));

    const authClient = createApiClient(request, apiKey);
    const res = await authClient.listIncidents('resolved');
    expect(res.ok()).toBeTruthy();
    const incidents = await res.json();
    const resolved = incidents.find((i: any) => i.monitorId === monitorId);
    expect(resolved).toBeTruthy();
    expect(resolved.downtimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

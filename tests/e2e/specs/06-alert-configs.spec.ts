import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';

let apiKey: string;
let monitorId: string;
let configId: string;

test.describe('Alert configs', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('alert-test');
    apiKey = (await keyRes.json()).key;

    const authClient = createApiClient(request, apiKey);
    const monRes = await authClient.createMonitor({
      name: 'Alert Config Monitor',
      slug: `alert-config-monitor-${Date.now()}`,
    });
    monitorId = (await monRes.json()).id;
  });

  test('create alert config', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.createAlertConfig({
      monitorId,
      channel: 'webhook',
      destination: 'https://httpbin.org/post',
      cooldownMinutes: 15,
      thresholdFailures: 2,
    });
    expect(res.ok()).toBeTruthy();
    const config = await res.json();
    expect(config.channel).toBe('webhook');
    expect(config.destination).toBe('https://httpbin.org/post');
    expect(config.cooldownMinutes).toBe(15);
    expect(config.thresholdFailures).toBe(2);
    expect(config.isEnabled).toBe(true);
    configId = config.id;
  });

  test('list alert configs', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.listAlertConfigs(monitorId);
    expect(res.ok()).toBeTruthy();
    const configs = await res.json();
    expect(configs.some((c: any) => c.id === configId)).toBeTruthy();
  });

  test('delete alert config', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.deleteAlertConfig(configId);
    expect(res.ok()).toBeTruthy();

    const listRes = await client.listAlertConfigs(monitorId);
    const configs = await listRes.json();
    expect(configs.some((c: any) => c.id === configId)).toBeFalsy();
  });
});

import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';

test.describe('Health endpoints', () => {
  test('GET /health returns ok', async ({ request }) => {
    const client = createApiClient(request);
    const res = await client.health();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
  });

  test('GET /ready returns ready', async ({ request }) => {
    const client = createApiClient(request);
    const res = await client.ready();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ready');
  });
});

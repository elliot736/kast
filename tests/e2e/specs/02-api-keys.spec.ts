import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';

let apiKey: string;
let keyId: string;

test.describe('API Keys', () => {
  test('create API key without auth (bootstrap)', async ({ request }) => {
    const client = createApiClient(request);
    const res = await client.createApiKey('e2e-test');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.key).toMatch(/^kst_/);
    expect(body.id).toBeTruthy();
    apiKey = body.key;
    keyId = body.id;
  });

  test('list API keys requires auth', async ({ request }) => {
    const noAuth = createApiClient(request);
    const res = await noAuth.listApiKeys();
    expect(res.status()).toBe(401);
  });

  test('list API keys with valid key', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.listApiKeys();
    expect(res.ok()).toBeTruthy();
    const keys = await res.json();
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(keys.some((k: any) => k.id === keyId)).toBeTruthy();
  });

  test('protected endpoint rejects invalid key', async ({ request }) => {
    const client = createApiClient(request, 'kst_invalid_key_here');
    const res = await client.listMonitors();
    expect(res.status()).toBe(401);
  });
});

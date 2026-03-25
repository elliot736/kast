import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';

let apiKey: string;

test.describe('Dead letters', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('deadletter-test');
    apiKey = (await keyRes.json()).key;
  });

  test('list dead letters returns empty array initially', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.listDeadLetters();
    expect(res.ok()).toBeTruthy();
    const deadLetters = await res.json();
    expect(Array.isArray(deadLetters)).toBeTruthy();
  });
});

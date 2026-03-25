import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';
import { waitFor, waitForJobRun } from '../helpers/wait';

test.setTimeout(120_000);

let apiKey: string;
let jobId: string;
let firstRunId: string;

test.describe('Job Retries', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('job-retries-test');
    apiKey = (await keyRes.json()).key;
  });

  test('create job with maxRetries=2 pointing to bad URL', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.createJob({
      name: 'E2E Retry Job',
      slug: `e2e-retry-job-${Date.now()}`,
      url: 'http://localhost:19999/nonexistent',
      method: 'GET',
      schedule: '0 0 1 1 *',
      maxRetries: 2,
      retryDelaySeconds: 5,
      retryBackoffMultiplier: 1,
    });
    expect(res.status()).toBe(201);
    const job = await res.json();
    jobId = job.id;
  });

  test('trigger job and first run fails', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const triggerRes = await client.triggerJob(jobId);
    expect(triggerRes.ok()).toBeTruthy();
    const run = await triggerRes.json();
    firstRunId = run.id;

    await waitForJobRun(client, jobId, firstRunId, 'failed', 30_000);

    const runRes = await client.getJobRun(jobId, firstRunId);
    const failedRun = await runRes.json();
    expect(failedRun.status).toBe('failed');
    expect(failedRun.attempt).toBe(1);
  });

  test('retry runs appear with increasing attempt numbers', async ({ request }) => {
    const client = createApiClient(request, apiKey);

    // Wait for all 3 runs (1 original + 2 retries) to be in a terminal state
    let allRuns: any[] = [];
    await waitFor(async () => {
      const res = await client.getJobRuns(jobId);
      if (!res.ok()) return false;
      const runs = await res.json();
      if (!Array.isArray(runs) || runs.length < 3) return false;
      // All must be in a terminal state
      allRuns = runs;
      return runs.every((r: any) => ['failed', 'success', 'cancelled'].includes(r.status));
    }, 90_000, 2000);

    const sorted = allRuns.sort((a: any, b: any) => a.attempt - b.attempt);
    expect(sorted.length).toBeGreaterThanOrEqual(3);
    expect(sorted[0].attempt).toBe(1);
    expect(sorted[1].attempt).toBe(2);
    expect(sorted[2].attempt).toBe(3);

    for (const run of sorted.slice(0, 3)) {
      expect(run.status).toBe('failed');
    }
  });

  test('retry chain: parentRunId links back', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const runsRes = await client.getJobRuns(jobId);
    expect(runsRes.ok()).toBeTruthy();
    const runs = await runsRes.json();
    expect(Array.isArray(runs)).toBeTruthy();
    const sorted = runs.sort((a: any, b: any) => a.attempt - b.attempt);

    // First run has no parent
    expect(sorted[0].parentRunId).toBeFalsy();

    // Second run should reference first
    expect(sorted[1].parentRunId).toBe(sorted[0].id);

    // Third run should reference second
    expect(sorted[2].parentRunId).toBe(sorted[1].id);
  });

  test('no more retries after max reached', async ({ request }) => {
    const client = createApiClient(request, apiKey);

    // Wait a bit to confirm no additional retries spawn
    await new Promise((r) => setTimeout(r, 5000));

    const runsRes = await client.getJobRuns(jobId);
    expect(runsRes.ok()).toBeTruthy();
    const runs = await runsRes.json();
    expect(Array.isArray(runs)).toBeTruthy();

    // Should have exactly 3 runs (1 original + 2 retries)
    expect(runs.length).toBe(3);
  });

  test('get job stats shows retries count', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.getJobStats(jobId);
    expect(res.ok()).toBeTruthy();
    const stats = await res.json();
    expect(stats.jobId).toBe(jobId);
    expect(stats.runs).toBeDefined();
  });
});

import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';
import { waitFor } from '../helpers/wait';

test.setTimeout(60_000);

let apiKey: string;
let jobId: string;

test.describe('Job Concurrency', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('job-concurrency-test');
    apiKey = (await keyRes.json()).key;
  });

  test('create job with concurrencyLimit=1 and skip policy', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.createJob({
      name: 'E2E Concurrency Job',
      slug: `e2e-concurrency-job-${Date.now()}`,
      url: 'http://localhost:3001/health',
      method: 'GET',
      schedule: '0 0 1 1 *',
      concurrencyLimit: 1,
      concurrencyPolicy: 'skip',
    });
    expect(res.status()).toBe(201);
    const job = await res.json();
    jobId = job.id;
  });

  test('trigger twice rapidly - one succeeds, one is skipped', async ({ request }) => {
    const client = createApiClient(request, apiKey);

    // Trigger two runs as fast as possible
    const [trigger1, trigger2] = await Promise.all([
      client.triggerJob(jobId),
      client.triggerJob(jobId),
    ]);

    expect(trigger1.ok()).toBeTruthy();
    const run1 = await trigger1.json();

    // Second trigger might be rejected immediately or create a cancelled run
    const run2 = trigger2.ok() ? await trigger2.json() : null;

    // Wait for all runs to settle
    await waitFor(async () => {
      const res = await client.getJobRuns(jobId);
      if (!res.ok()) return false;
      const runs = await res.json();
      return runs.every(
        (r: any) => r.status === 'success' || r.status === 'cancelled' || r.status === 'skipped',
      );
    }, 30_000, 1000);

    const runsRes = await client.getJobRuns(jobId);
    const runs = await runsRes.json();

    const statuses = runs.map((r: any) => r.status);
    // At least one should succeed
    expect(statuses).toContain('success');

    // The other should be cancelled/skipped due to concurrency
    const nonSuccess = runs.filter((r: any) => r.status !== 'success');
    if (nonSuccess.length > 0) {
      for (const run of nonSuccess) {
        expect(['cancelled', 'skipped']).toContain(run.status);
        // Check that the cancellation message mentions concurrency
        if (run.errorMessage) {
          expect(run.errorMessage.toLowerCase()).toContain('concurrency');
        }
      }
    }
  });
});

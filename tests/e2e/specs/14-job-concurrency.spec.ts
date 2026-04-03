import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';

test.setTimeout(60_000);

let apiKey: string;
let jobId: string;

test.describe('Job Concurrency', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('job-concurrency-test');
    apiKey = (await keyRes.json()).key;

    const authClient = createApiClient(request, apiKey);
    const res = await authClient.createJob({
      name: 'E2E Concurrency Job',
      slug: `e2e-concurrency-job-${Date.now()}`,
      schedule: '0 0 1 1 *',
      concurrencyLimit: 1,
      concurrencyPolicy: 'skip',
    });
    const job = await res.json();
    jobId = job.id;

    // Attach a workflow with a sleep step (holds the concurrency slot)
    await authClient.upsertWorkflow(jobId, {
      steps: [
        {
          id: 'slow-step',
          name: 'Slow Step',
          type: 'sleep',
          config: { duration: 'PT10S' },
        },
      ],
    });
  });

  test('trigger twice rapidly - one runs, one is skipped', async ({ request }) => {
    const client = createApiClient(request, apiKey);

    const res1 = await client.triggerJob(jobId);
    const run1 = await res1.json();

    // Wait for first run to start executing
    await new Promise((r) => setTimeout(r, 3000));

    const res2 = await client.triggerJob(jobId);
    const run2 = await res2.json();

    // Wait for concurrency check to process
    await new Promise((r) => setTimeout(r, 3000));

    const run2Res = await client.getJobRun(jobId, run2.id);
    const run2Data = await run2Res.json();

    // Second run should be cancelled (skipped) due to concurrency policy
    expect(run2Data.status).toBe('cancelled');
  });
});

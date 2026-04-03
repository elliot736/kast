import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';
import { waitForJobRun } from '../helpers/wait';

test.setTimeout(120_000);

let apiKey: string;
let jobId: string;

test.describe('Job Retries', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('job-retries-test');
    apiKey = (await keyRes.json()).key;
  });

  test('create job with workflow that hits a bad URL', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.createJob({
      name: 'E2E Retry Job',
      slug: `e2e-retry-job-${Date.now()}`,
      schedule: '0 0 1 1 *',
      maxRetries: 2,
      retryDelaySeconds: 5,
    });
    expect(res.status()).toBe(201);
    const job = await res.json();
    jobId = job.id;

    // Attach a workflow with a failing step
    await client.upsertWorkflow(jobId, {
      steps: [
        {
          id: 'bad-request',
          name: 'Bad Request',
          type: 'run',
          config: { url: 'http://localhost:19999/nonexistent', method: 'GET' },
        },
      ],
    });
  });

  test('trigger job — workflow fails', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const triggerRes = await client.triggerJob(jobId);
    expect(triggerRes.ok()).toBeTruthy();
    const run = await triggerRes.json();

    await waitForJobRun(client, jobId, run.id, 'failed', 30_000);

    const runRes = await client.getJobRun(jobId, run.id);
    const failedRun = await runRes.json();
    expect(failedRun.status).toBe('failed');
  });
});

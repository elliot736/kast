import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';
import { waitForJobRun } from '../helpers/wait';

test.setTimeout(120_000);

let apiKey: string;
let jobId: string;
let runId: string;

test.describe('Job Execution', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('job-execution-test');
    apiKey = (await keyRes.json()).key;

    // Create a job and attach a workflow
    const authClient = createApiClient(request, apiKey);
    const res = await authClient.createJob({
      name: 'E2E Execution Job',
      slug: `e2e-execution-job-${Date.now()}`,
      schedule: '0 0 1 1 *',
    });
    const job = await res.json();
    jobId = job.id;

    // Create a simple workflow: one HTTP step
    await authClient.upsertWorkflow(jobId, {
      steps: [
        {
          id: 'health-check',
          name: 'Health Check',
          type: 'run',
          config: { url: 'http://localhost:3001/health', method: 'GET' },
        },
      ],
    });
  });

  test('manual trigger creates run', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.triggerJob(jobId);
    expect(res.ok()).toBeTruthy();
    const run = await res.json();
    expect(run.id).toBeTruthy();
    runId = run.id;
  });

  test('wait for run to complete with success', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    await waitForJobRun(client, jobId, runId, 'success', 30_000);

    const res = await client.getJobRun(jobId, runId);
    const run = await res.json();
    expect(run.status).toBe('success');
    expect(run.durationMs).toBeGreaterThan(0);
  });

  test('run logs are generated', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.getRunLogs(jobId, runId);
    expect(res.ok()).toBeTruthy();
    const logs = await res.json();
    expect(logs.length).toBeGreaterThan(0);
  });

  test('trigger job with no workflow fails', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    // Create a job without a workflow
    const jobRes = await client.createJob({
      name: 'E2E No Workflow Job',
      slug: `e2e-no-workflow-${Date.now()}`,
      schedule: '0 0 1 1 *',
    });
    const job = await jobRes.json();

    const triggerRes = await client.triggerJob(job.id);
    expect(triggerRes.ok()).toBeTruthy();
    const run = await triggerRes.json();

    // Wait for it to fail
    await waitForJobRun(client, job.id, run.id, 'failed', 10_000);
    const runRes = await client.getJobRun(job.id, run.id);
    const failedRun = await runRes.json();
    expect(failedRun.status).toBe('failed');
    expect(failedRun.errorMessage).toContain('No workflow configured');
  });
});

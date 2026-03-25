import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';
import { waitForJobRun } from '../helpers/wait';

test.setTimeout(60_000);

let apiKey: string;
let jobId: string;
let runId: string;

test.describe('Job Execution', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('job-execution-test');
    apiKey = (await keyRes.json()).key;

    // Create a job that hits the health endpoint
    const authClient = createApiClient(request, apiKey);
    const res = await authClient.createJob({
      name: 'E2E Execution Job',
      slug: `e2e-execution-job-${Date.now()}`,
      url: 'http://localhost:3001/health',
      method: 'GET',
      schedule: '0 0 1 1 *', // far future so it doesn't auto-run
    });
    const job = await res.json();
    jobId = job.id;
  });

  test('manual trigger creates run in scheduled status', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.triggerJob(jobId);
    expect(res.ok()).toBeTruthy();
    const run = await res.json();
    expect(run.id).toBeTruthy();
    expect(['scheduled', 'running', 'success']).toContain(run.status);
    runId = run.id;
  });

  test('wait for run to complete with success', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    await waitForJobRun(client, jobId, runId, 'success', 30_000);

    const res = await client.getJobRun(jobId, runId);
    expect(res.ok()).toBeTruthy();
    const run = await res.json();
    expect(run.status).toBe('success');
    expect(run.httpStatus).toBe(200);
    expect(run.durationMs).toBeGreaterThan(0);
  });

  test('run logs are generated', async ({ request }) => {
    // Wait for log sink to flush (batches every 500ms)
    await new Promise((r) => setTimeout(r, 2000));
    const client = createApiClient(request, apiKey);
    const res = await client.getRunLogs(jobId, runId);
    expect(res.ok()).toBeTruthy();
    const logs = await res.json();
    expect(Array.isArray(logs)).toBeTruthy();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l: any) => l.level === 'info')).toBeTruthy();
  });

  test('job lastRunAt is updated after execution', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.getJob(jobId);
    expect(res.ok()).toBeTruthy();
    const job = await res.json();
    expect(job.lastRunAt).toBeTruthy();
  });

  test('trigger job with invalid URL results in failed run', async ({ request }) => {
    const client = createApiClient(request, apiKey);

    // Create a job pointing to a bad URL
    const createRes = await client.createJob({
      name: 'E2E Failing Job',
      slug: `e2e-failing-job-${Date.now()}`,
      url: 'http://localhost:19999/nonexistent',
      method: 'GET',
      schedule: '0 0 1 1 *',
    });
    const failJob = await createRes.json();

    const triggerRes = await client.triggerJob(failJob.id);
    expect(triggerRes.ok()).toBeTruthy();
    const failRun = await triggerRes.json();

    await waitForJobRun(client, failJob.id, failRun.id, 'failed', 30_000);

    const runRes = await client.getJobRun(failJob.id, failRun.id);
    const run = await runRes.json();
    expect(run.status).toBe('failed');
    expect(run.errorMessage).toBeTruthy();
  });

  test('cancel a scheduled run', async ({ request }) => {
    const client = createApiClient(request, apiKey);

    // Create a job pointing to a slow endpoint (use health, trigger, then cancel quickly)
    const createRes = await client.createJob({
      name: 'E2E Cancel Job',
      slug: `e2e-cancel-job-${Date.now()}`,
      url: 'http://localhost:3001/health',
      method: 'GET',
      schedule: '0 0 1 1 *',
    });
    const cancelJob = await createRes.json();

    const triggerRes = await client.triggerJob(cancelJob.id);
    expect(triggerRes.ok()).toBeTruthy();
    const run = await triggerRes.json();

    const cancelRes = await client.cancelRun(cancelJob.id, run.id);
    // Cancel may succeed or the run may have already completed
    if (cancelRes.ok()) {
      const cancelledRun = await cancelRes.json();
      expect(cancelledRun.status).toBe('cancelled');
    } else {
      // Run already completed, verify it finished
      const runRes = await client.getJobRun(cancelJob.id, run.id);
      const finishedRun = await runRes.json();
      expect(['success', 'cancelled']).toContain(finishedRun.status);
    }
  });
});

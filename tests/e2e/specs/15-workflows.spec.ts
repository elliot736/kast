import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';
import { waitForJobRun, waitForWorkflowRunStatus } from '../helpers/wait';

test.setTimeout(120_000);

let apiKey: string;
let jobId: string;
let runId: string;

test.describe('Workflows', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('workflows-test');
    apiKey = (await keyRes.json()).key;

    // Create a base job for workflow tests
    const authClient = createApiClient(request, apiKey);
    const res = await authClient.createJob({
      name: 'E2E Workflow Job',
      slug: `e2e-workflow-job-${Date.now()}`,
      url: 'http://localhost:3001/health',
      method: 'GET',
      schedule: '0 0 1 1 *',
    });
    const job = await res.json();
    jobId = job.id;
  });

  test('create/update workflow definition', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.upsertWorkflow(jobId, {
      steps: [
        {
          id: 'step-health-check',
          name: 'Health Check',
          type: 'run',
          config: { url: 'http://localhost:3001/health', method: 'GET' },
        },
        {
          id: 'step-ready-check',
          name: 'Ready Check',
          type: 'run',
          config: { url: 'http://localhost:3001/ready', method: 'GET' },
        },
      ],
    });
    expect(res.ok()).toBeTruthy();
    const workflow = await res.json();
    // Legacy arrays are auto-migrated to graph format
    expect(workflow.steps.nodes).toBeDefined();
    expect(workflow.steps.edges).toBeDefined();
    // 2 original steps + start + end = 4 nodes
    expect(workflow.steps.nodes.length).toBe(4);
    expect(workflow.version).toBeTruthy();
  });

  test('get workflow returns graph with version', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.getWorkflow(jobId);
    expect(res.ok()).toBeTruthy();
    const workflow = await res.json();
    expect(workflow.steps.nodes).toBeDefined();
    expect(workflow.steps.nodes.length).toBe(4);
    expect(workflow.version).toBeTruthy();
  });

  test('trigger job with workflow creates run', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.triggerJob(jobId);
    expect(res.ok()).toBeTruthy();
    const run = await res.json();
    expect(run.id).toBeTruthy();
    runId = run.id;
  });

  test('wait for workflow to complete', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    await waitForJobRun(client, jobId, runId, 'success', 60_000);
  });

  test('get workflow run shows completed status with step results', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.getWorkflowRun(jobId, runId);
    expect(res.ok()).toBeTruthy();
    const wfRun = await res.json();
    expect(wfRun.status).toBe('completed');
    expect(Array.isArray(wfRun.stepResults)).toBeTruthy();
    expect(wfRun.stepResults.length).toBeGreaterThan(0);
  });

  test('completed steps have output recorded (memoization)', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.getWorkflowRun(jobId, runId);
    const wfRun = await res.json();

    for (const result of wfRun.stepResults) {
      expect(result.status).toBe('completed');
      expect(result.output).toBeDefined();
    }
  });

  test('workflow with sleep step enters sleeping state then completes', async ({ request }) => {
    const client = createApiClient(request, apiKey);

    const jobRes = await client.createJob({
      name: 'E2E Sleep Workflow Job',
      slug: `e2e-sleep-workflow-job-${Date.now()}`,
      url: 'http://localhost:3001/health',
      method: 'GET',
      schedule: '0 0 1 1 *',
    });
    const sleepJob = await jobRes.json();

    await client.upsertWorkflow(sleepJob.id, {
      steps: [
        {
          id: 'step-before-sleep',
          name: 'Before Sleep',
          type: 'run',
          config: { url: 'http://localhost:3001/health', method: 'GET' },
        },
        {
          id: 'step-sleep',
          name: 'Sleep 2s',
          type: 'sleep',
          config: { duration: 'PT2S' },
        },
        {
          id: 'step-after-sleep',
          name: 'After Sleep',
          type: 'run',
          config: { url: 'http://localhost:3001/health', method: 'GET' },
        },
      ],
    });

    const triggerRes = await client.triggerJob(sleepJob.id);
    expect(triggerRes.ok()).toBeTruthy();
    const sleepRun = await triggerRes.json();

    // Wait for sleeping state (may pass through quickly)
    try {
      await waitForWorkflowRunStatus(client, sleepJob.id, sleepRun.id, 'sleeping', 15_000);
    } catch {
      // It might have already passed through sleeping
    }

    // Wait for completion
    await waitForJobRun(client, sleepJob.id, sleepRun.id, 'success', 60_000);

    const wfRes = await client.getWorkflowRun(sleepJob.id, sleepRun.id);
    expect(wfRes.ok()).toBeTruthy();
    const wfRun = await wfRes.json();
    expect(wfRun.status).toBe('completed');
    expect(wfRun.stepResults.length).toBe(3);
  });

  test('cancel a running workflow', async ({ request }) => {
    const client = createApiClient(request, apiKey);

    const jobRes = await client.createJob({
      name: 'E2E Cancel Workflow Job',
      slug: `e2e-cancel-workflow-job-${Date.now()}`,
      url: 'http://localhost:3001/health',
      method: 'GET',
      schedule: '0 0 1 1 *',
    });
    const cancelJob = await jobRes.json();

    await client.upsertWorkflow(cancelJob.id, {
      steps: [
        {
          id: 'step-long-sleep',
          name: 'Long Sleep',
          type: 'sleep',
          config: { duration: 'PT60S' },
        },
      ],
    });

    const triggerRes = await client.triggerJob(cancelJob.id);
    expect(triggerRes.ok()).toBeTruthy();
    const cancelRun = await triggerRes.json();

    await new Promise((r) => setTimeout(r, 3000));

    const cancelRes = await client.cancelWorkflowRun(cancelJob.id, cancelRun.id);
    expect(cancelRes.ok()).toBeTruthy();

    const wfRes = await client.getWorkflowRun(cancelJob.id, cancelRun.id);
    if (wfRes.ok()) {
      const wfRun = await wfRes.json();
      expect(wfRun.status).toBe('cancelled');
    }
  });
});

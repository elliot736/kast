import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';
import { waitForWorkflowRunStatus, waitForJobRun } from '../helpers/wait';

test.setTimeout(120_000);

let apiKey: string;
let jobId: string;

test.describe('Workflow Signals', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('workflow-signals-test');
    apiKey = (await keyRes.json()).key;

    const authClient = createApiClient(request, apiKey);
    const jobRes = await authClient.createJob({
      name: 'E2E Workflow Signal Job',
      slug: `e2e-workflow-signal-job-${Date.now()}`,
      url: 'http://localhost:3001/health',
      method: 'GET',
      schedule: '0 0 1 1 *',
    });
    const job = await jobRes.json();
    jobId = job.id;
  });

  test('create workflow with wait_for_signal step', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.upsertWorkflow(jobId, {
      steps: [
        {
          id: 'step-start',
          name: 'Initial Check',
          type: 'run',
          config: { url: 'http://localhost:3001/health', method: 'GET' },
        },
        {
          id: 'step-wait-signal',
          name: 'Wait for Signal',
          type: 'wait_for_signal',
          config: { timeoutDuration: 'PT2M' },
        },
        {
          id: 'step-after-signal',
          name: 'Post-Signal Check',
          type: 'run',
          config: { url: 'http://localhost:3001/health', method: 'GET' },
        },
      ],
    });
    expect(res.ok()).toBeTruthy();
    const workflow = await res.json();
    expect(workflow.steps.nodes).toBeDefined();
  });

  test('trigger workflow and it enters waiting state', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const triggerRes = await client.triggerJob(jobId);
    expect(triggerRes.ok()).toBeTruthy();
    const run = await triggerRes.json();

    await waitForWorkflowRunStatus(client, jobId, run.id, 'waiting', 30_000);

    const wfRes = await client.getWorkflowRun(jobId, run.id);
    expect(wfRes.ok()).toBeTruthy();
    const wfRun = await wfRes.json();
    expect(wfRun.status).toBe('waiting');
  });
});

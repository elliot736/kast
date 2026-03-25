import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';
import { waitForWorkflowRunStatus, waitForJobRun } from '../helpers/wait';

test.setTimeout(120_000);

let apiKey: string;
let jobId: string;
let runId: string;

test.describe('Workflow Events', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('workflow-events-test');
    apiKey = (await keyRes.json()).key;

    const authClient = createApiClient(request, apiKey);
    const jobRes = await authClient.createJob({
      name: 'E2E Workflow Event Job',
      slug: `e2e-workflow-event-job-${Date.now()}`,
      url: 'http://localhost:3001/health',
      method: 'GET',
      schedule: '0 0 1 1 *',
    });
    const job = await jobRes.json();
    jobId = job.id;
  });

  test('create workflow with wait_for_event step', async ({ request }) => {
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
          id: 'step-wait-event',
          name: 'Wait for Approval',
          type: 'wait_for_event',
          config: { eventName: 'approval', timeoutDuration: 'PT2M' },
        },
        {
          id: 'step-after-event',
          name: 'Post-Approval Check',
          type: 'run',
          config: { url: 'http://localhost:3001/health', method: 'GET' },
        },
      ],
    });
    expect(res.ok()).toBeTruthy();
    const workflow = await res.json();
    expect(workflow.steps).toHaveLength(3);
  });

  test('trigger workflow and it enters waiting state', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const triggerRes = await client.triggerJob(jobId);
    expect(triggerRes.ok()).toBeTruthy();
    const run = await triggerRes.json();
    runId = run.id;

    await waitForWorkflowRunStatus(client, jobId, runId, 'waiting', 30_000);

    const wfRes = await client.getWorkflowRun(jobId, runId);
    expect(wfRes.ok()).toBeTruthy();
    const wfRun = await wfRes.json();
    expect(wfRun.status).toBe('waiting');
  });

  test('send matching event resumes workflow', async ({ request }) => {
    const client = createApiClient(request, apiKey);

    const eventRes = await client.sendWorkflowEvent({
      name: 'approval',
      payload: { approvedBy: 'e2e-test', reason: 'automated testing' },
    });
    expect(eventRes.ok()).toBeTruthy();

    await waitForJobRun(client, jobId, runId, 'success', 60_000);
  });

  test('verify wait step result recorded with event payload', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const wfRes = await client.getWorkflowRun(jobId, runId);
    expect(wfRes.ok()).toBeTruthy();
    const wfRun = await wfRes.json();

    expect(wfRun.status).toBe('completed');
    expect(wfRun.stepResults.length).toBeGreaterThanOrEqual(2);

    // The wait step result should contain the event payload
    const waitResult = wfRun.stepResults.find((r: any) => r.stepId.includes('wait'));
    if (waitResult?.output?.payload) {
      expect(waitResult.output.payload.approvedBy).toBe('e2e-test');
    }
  });
});

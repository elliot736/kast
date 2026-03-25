import { createApiClient } from './api-client';

export async function waitFor(
  fn: () => Promise<boolean>,
  timeoutMs = 15_000,
  intervalMs = 500,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

export async function waitForMonitorStatus(
  client: ReturnType<typeof createApiClient>,
  monitorId: string,
  expectedStatus: string,
  timeoutMs = 90_000,
) {
  await waitFor(async () => {
    const res = await client.getMonitor(monitorId);
    if (!res.ok()) return false;
    const monitor = await res.json();
    return monitor.status === expectedStatus;
  }, timeoutMs, 2000);
}

export async function waitForIncident(
  client: ReturnType<typeof createApiClient>,
  monitorId: string,
  status: string,
  timeoutMs = 90_000,
) {
  await waitFor(async () => {
    const res = await client.listIncidents(status);
    if (!res.ok()) return false;
    const incidents = await res.json();
    return incidents.some((i: any) => i.monitorId === monitorId);
  }, timeoutMs, 2000);
}

export async function waitForJobRun(
  client: ReturnType<typeof createApiClient>,
  jobId: string,
  runId: string,
  expectedStatus: string,
  timeoutMs = 30_000,
) {
  await waitFor(async () => {
    const res = await client.getJobRun(jobId, runId);
    if (!res.ok()) return false;
    const run = await res.json();
    return run.status === expectedStatus;
  }, timeoutMs, 1000);
}

export async function waitForWorkflowRunStatus(
  client: ReturnType<typeof createApiClient>,
  jobId: string,
  runId: string,
  expectedStatus: string,
  timeoutMs = 60_000,
) {
  await waitFor(async () => {
    const res = await client.getWorkflowRun(jobId, runId);
    if (!res.ok()) return false;
    const wfRun = await res.json();
    return wfRun.status === expectedStatus;
  }, timeoutMs, 2000);
}

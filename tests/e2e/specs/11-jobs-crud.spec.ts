import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';

let apiKey: string;
let jobId: string;

test.describe('Jobs CRUD', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('jobs-crud-test');
    apiKey = (await keyRes.json()).key;
  });

  test('create a job with valid data', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.createJob({
      name: 'E2E CRUD Job',
      slug: `e2e-crud-job-${Date.now()}`,
      url: 'http://localhost:3001/health',
      method: 'GET',
      schedule: '*/10 * * * *',
      tags: ['test', 'e2e'],
    });
    expect(res.status()).toBe(201);
    const job = await res.json();
    expect(job.id).toBeTruthy();
    expect(job.name).toBe('E2E CRUD Job');
    expect(job.url).toBe('http://localhost:3001/health');
    expect(job.method).toBe('GET');
    expect(job.schedule).toBe('*/10 * * * *');
    expect(job.nextRunAt).toBeTruthy();
    expect(job.status).toBe('active');
    jobId = job.id;
  });

  test('create job with invalid data (missing url) returns 400', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.createJob({
      name: 'Invalid Job',
      schedule: '*/5 * * * *',
    });
    expect(res.status()).toBe(400);
  });

  test('get job by ID', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.getJob(jobId);
    expect(res.ok()).toBeTruthy();
    const job = await res.json();
    expect(job.id).toBe(jobId);
    expect(job.name).toBe('E2E CRUD Job');
    expect(job.tags).toEqual(['test', 'e2e']);
  });

  test('list jobs includes created job', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.listJobs();
    expect(res.ok()).toBeTruthy();
    const jobs = await res.json();
    expect(jobs.some((j: any) => j.id === jobId)).toBeTruthy();
  });

  test('list jobs filtered by status', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.listJobs({ status: 'active' });
    expect(res.ok()).toBeTruthy();
    const jobs = await res.json();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j: any) => j.status === 'active')).toBeTruthy();
  });

  test('update job name and schedule', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.updateJob(jobId, {
      name: 'Updated CRUD Job',
      schedule: '*/15 * * * *',
    });
    expect(res.ok()).toBeTruthy();
    const job = await res.json();
    expect(job.name).toBe('Updated CRUD Job');
    expect(job.schedule).toBe('*/15 * * * *');
    expect(job.nextRunAt).toBeTruthy();
  });

  test('pause job', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.pauseJob(jobId);
    expect(res.ok()).toBeTruthy();
    const job = await res.json();
    expect(job.status).toBe('paused');
  });

  test('resume job', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.resumeJob(jobId);
    expect(res.ok()).toBeTruthy();
    const job = await res.json();
    expect(job.status).toBe('active');
    expect(job.nextRunAt).toBeTruthy();
  });

  test('delete job and confirm 404', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    // Create a throwaway job to delete
    const createRes = await client.createJob({
      name: 'Delete Me Job',
      slug: `delete-me-job-${Date.now()}`,
      url: 'http://localhost:3001/health',
      method: 'GET',
      schedule: '*/30 * * * *',
    });
    const created = await createRes.json();

    const res = await client.deleteJob(created.id);
    expect(res.ok()).toBeTruthy();

    const getRes = await client.getJob(created.id);
    expect(getRes.status()).toBe(404);
  });

  test('get job stats', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.getJobStats(jobId);
    expect(res.ok()).toBeTruthy();
    const stats = await res.json();
    expect(stats.jobId).toBe(jobId);
    expect(stats.runs).toBeDefined();
  });
});

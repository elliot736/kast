import { execSync, spawn, type ChildProcess } from 'child_process';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

let apiProcess: ChildProcess | null = null;

async function waitForUrl(url: string, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

export default async function globalSetup() {
  console.log('Starting infra (Redpanda + Postgres)...');
  execSync('docker compose up -d redpanda postgres', {
    cwd: ROOT,
    stdio: 'inherit',
  });

  // Wait for Postgres to be ready
  console.log('Waiting for Postgres...');
  const pgStart = Date.now();
  while (Date.now() - pgStart < 30_000) {
    try {
      execSync('docker exec kast-postgres pg_isready -U kast', { stdio: 'pipe' });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Wait for Redpanda to be ready
  console.log('Waiting for Redpanda...');
  const rpStart = Date.now();
  while (Date.now() - rpStart < 30_000) {
    try {
      execSync('docker exec kast-redpanda rpk cluster health', { stdio: 'pipe' });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Run migrations
  console.log('Running migrations...');
  execSync('npx drizzle-kit migrate', {
    cwd: resolve(ROOT, 'apps/api'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'postgresql://kast:kast@localhost:25432/kast' },
  });

  // Start the API
  console.log('Starting API...');
  apiProcess = spawn('npx', ['nest', 'start'], {
    cwd: resolve(ROOT, 'apps/api'),
    stdio: 'pipe',
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://kast:kast@localhost:25432/kast',
      KAFKA_BROKERS: 'localhost:29092',
      API_PORT: '3001',
      NODE_ENV: 'test',
    },
  });

  apiProcess.stdout?.on('data', (d) => process.stdout.write(`[api] ${d}`));
  apiProcess.stderr?.on('data', (d) => process.stderr.write(`[api] ${d}`));

  // Store PID for teardown
  process.env.__KAST_API_PID = String(apiProcess.pid);

  console.log('Waiting for API to be ready...');
  await waitForUrl(`${API_URL}/health`, 30_000);
  console.log('API ready!');
}

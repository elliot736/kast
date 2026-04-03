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

  // Run migrations (apply SQL files directly — drizzle-kit can't handle ALTER TYPE ADD VALUE in transactions)
  console.log('Running migrations...');
  const DB_URL = 'postgresql://kast:kast@localhost:25432/kast';
  const migrationsDir = resolve(ROOT, 'apps/api/drizzle/migrations');

  // Reset schema
  execSync(`psql "${DB_URL}" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"`, { stdio: 'inherit' });

  // Migration 0000: base schema
  execSync(`psql "${DB_URL}" -f "${migrationsDir}/0000_fantastic_kinsey_walden.sql"`, { stdio: 'inherit' });

  // Migration 0001: ALTER TYPE (must run outside transaction) + columns
  execSync(`psql "${DB_URL}" -c "ALTER TYPE public.incident_status ADD VALUE IF NOT EXISTS 'acknowledged' BEFORE 'resolved';"`, { stdio: 'inherit' });
  execSync(`psql "${DB_URL}" -c "
    ALTER TABLE monitors ADD COLUMN IF NOT EXISTS team_id uuid;
    ALTER TABLE monitors ADD COLUMN IF NOT EXISTS log_retention_days integer DEFAULT 30;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_at timestamp with time zone;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_by varchar(255);
    DO \\$\\$ BEGIN
      ALTER TABLE monitors ADD CONSTRAINT monitors_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE no action ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END \\$\\$;
  "`, { stdio: 'inherit' });

  // Migration 0002: jobs, workflows, etc
  execSync(`psql "${DB_URL}" -f "${migrationsDir}/0002_salty_toro.sql"`, { stdio: 'inherit' });

  // Migration 0003: DAG workflow + auth + signals
  execSync(`psql "${DB_URL}" -f "${migrationsDir}/0003_dag_workflow.sql"`, { stdio: 'inherit' });

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

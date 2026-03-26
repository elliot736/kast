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

  // Run migrations (apply SQL files directly — drizzle-kit migrate can't handle ALTER TYPE ADD VALUE in transactions)
  console.log('Running migrations...');
  const DB_URL = 'postgresql://kast:kast@localhost:25432/kast';
  const migrationsDir = resolve(ROOT, 'apps/api/drizzle/migrations');
  execSync(`psql "${DB_URL}" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"`, { stdio: 'inherit' });
  execSync(`psql "${DB_URL}" -f "${migrationsDir}/0000_fantastic_kinsey_walden.sql"`, { stdio: 'inherit' });
  // ALTER TYPE must run outside a transaction
  execSync(`psql "${DB_URL}" -c "ALTER TYPE public.incident_status ADD VALUE IF NOT EXISTS 'acknowledged' BEFORE 'resolved';"`, { stdio: 'inherit' });
  // Rest of migration 0001
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
  execSync(`psql "${DB_URL}" -f "${migrationsDir}/0002_salty_toro.sql"`, { stdio: 'inherit' });
  // Auth tables (Better Auth doesn't auto-create)
  execSync(`psql "${DB_URL}" -c "
    CREATE TABLE IF NOT EXISTS \\\"user\\\" (
      id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
      email_verified boolean NOT NULL DEFAULT false, image text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS session (
      id text PRIMARY KEY, user_id text NOT NULL REFERENCES \\\"user\\\"(id) ON DELETE CASCADE,
      token text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
      ip_address text, user_agent text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS account (
      id text PRIMARY KEY, user_id text NOT NULL REFERENCES \\\"user\\\"(id) ON DELETE CASCADE,
      account_id text NOT NULL, provider_id text NOT NULL,
      access_token text, refresh_token text,
      access_token_expires_at timestamptz, refresh_token_expires_at timestamptz,
      scope text, id_token text, password text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS verification (
      id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
  "`, { stdio: 'inherit' });

  // Schema fixups for columns added after initial migrations
  execSync(`psql "${DB_URL}" -c "
    ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS waiting_for_child_run_id uuid;
    ALTER TABLE workflow_runs DROP COLUMN IF EXISTS waiting_for_event;
    ALTER TABLE workflow_runs DROP COLUMN IF EXISTS waiting_for_filter;
  "`, { stdio: 'inherit' });

  // Workflow signal table
  execSync(`psql "${DB_URL}" -c "
    CREATE TABLE IF NOT EXISTS workflow_signal (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      target_run_id uuid REFERENCES workflow_runs(id) ON DELETE CASCADE,
      source_run_id uuid,
      source_step_id varchar(255),
      payload jsonb DEFAULT '{}',
      delivered boolean DEFAULT false,
      delivered_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ws_target_idx ON workflow_signal (target_run_id, delivered);
  "`, { stdio: 'inherit' });

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

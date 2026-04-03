-- DAG workflow model: add graph-related columns to workflow_runs and workflow_step_results

ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "current_step_id" varchar(255);
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "completed_nodes" jsonb DEFAULT '[]';
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "loop_counters" jsonb DEFAULT '{}';

ALTER TABLE "workflow_step_results" ADD COLUMN IF NOT EXISTS "iteration" integer DEFAULT 1;
CREATE INDEX IF NOT EXISTS "wsr_run_step_id_idx" ON "workflow_step_results" ("workflow_run_id", "step_id");

-- Auth tables (created by Better Auth, but needed after DB resets)
CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean NOT NULL DEFAULT false,
  "image" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "access_token_expires_at" timestamptz,
  "refresh_token_expires_at" timestamptz,
  "scope" text,
  "id_token" text,
  "password" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Workflow signal table
CREATE TABLE IF NOT EXISTS "workflow_signal" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "target_run_id" uuid REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "source_run_id" uuid,
  "source_step_id" varchar(255),
  "payload" jsonb DEFAULT '{}',
  "delivered" boolean DEFAULT false,
  "delivered_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ws_target_idx" ON "workflow_signal" ("target_run_id", "delivered");

-- Make job URL optional (workflows handle execution now)
ALTER TABLE "jobs" ALTER COLUMN "url" DROP NOT NULL;

-- Schema fixups for columns from signal rework
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "waiting_for_child_run_id" uuid;
ALTER TABLE "workflow_runs" DROP COLUMN IF EXISTS "waiting_for_event";
ALTER TABLE "workflow_runs" DROP COLUMN IF EXISTS "waiting_for_filter";

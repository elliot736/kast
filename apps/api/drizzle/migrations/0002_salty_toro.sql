CREATE TYPE "public"."job_status" AS ENUM('active', 'paused', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('scheduled', 'running', 'success', 'failed', 'timeout', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('cron', 'manual', 'retry');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('running', 'sleeping', 'waiting', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."step_result_status" AS ENUM('completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"schedule" varchar(255) NOT NULL,
	"timezone" varchar(100) DEFAULT 'UTC',
	"status" "job_status" DEFAULT 'active' NOT NULL,
	"url" text NOT NULL,
	"method" varchar(10) DEFAULT 'POST',
	"headers" jsonb DEFAULT '{}'::jsonb,
	"body" text,
	"timeout_seconds" integer DEFAULT 30,
	"max_retries" integer DEFAULT 0,
	"retry_delay_seconds" integer DEFAULT 60,
	"retry_backoff_multiplier" integer DEFAULT 2,
	"retry_max_delay_seconds" integer DEFAULT 3600,
	"concurrency_limit" integer DEFAULT 1,
	"concurrency_policy" varchar(20) DEFAULT 'queue',
	"success_status_codes" jsonb DEFAULT '[200,201,202,204]'::jsonb,
	"monitor_id" uuid,
	"team_id" uuid,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'scheduled' NOT NULL,
	"trigger" "run_trigger" DEFAULT 'cron' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"http_status" integer,
	"response_body" text,
	"error_message" text,
	"attempt" integer DEFAULT 1,
	"queued_at" timestamp with time zone,
	"parent_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_run_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"level" varchar(10) NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"steps" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"job_run_id" uuid NOT NULL,
	"status" "workflow_run_status" DEFAULT 'running' NOT NULL,
	"current_step_index" integer DEFAULT 0,
	"context" jsonb DEFAULT '{}'::jsonb,
	"resume_at" timestamp with time zone,
	"waiting_for_event" varchar(255),
	"waiting_for_filter" jsonb,
	"wait_timeout_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now(),
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_step_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"step_id" varchar(255) NOT NULL,
	"step_index" integer NOT NULL,
	"status" "step_result_status" NOT NULL,
	"output" jsonb,
	"error_message" text,
	"duration_ms" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_run_logs" ADD CONSTRAINT "job_run_logs_run_id_job_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."job_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_results" ADD CONSTRAINT "workflow_step_results_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_next_run_at_idx" ON "jobs" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "jobs_monitor_id_idx" ON "jobs" USING btree ("monitor_id");--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "job_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_runs_status_idx" ON "job_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_runs_scheduled_at_idx" ON "job_runs" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "job_runs_job_created_idx" ON "job_runs" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "job_run_logs_run_idx" ON "job_run_logs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "job_run_logs_timestamp_idx" ON "job_run_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "workflows_job_idx" ON "workflows" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "workflows_job_version_idx" ON "workflows" USING btree ("job_id","version");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_runs_resume_at_idx" ON "workflow_runs" USING btree ("resume_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_waiting_event_idx" ON "workflow_runs" USING btree ("waiting_for_event");--> statement-breakpoint
CREATE INDEX "wsr_run_idx" ON "workflow_step_results" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "wsr_run_step_idx" ON "workflow_step_results" USING btree ("workflow_run_id","step_index");

CREATE TYPE "public"."monitor_status" AS ENUM('healthy', 'late', 'down', 'paused');--> statement-breakpoint
CREATE TYPE "public"."ping_type" AS ENUM('start', 'success', 'fail', 'log');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."alert_channel" AS ENUM('slack', 'discord', 'email', 'webhook', 'pagerduty', 'telegram');--> statement-breakpoint
CREATE TYPE "public"."alert_delivery_status" AS ENUM('sent', 'failed', 'retrying');--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"ping_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"description" text,
	"schedule" varchar(255),
	"interval_seconds" integer,
	"grace_seconds" integer DEFAULT 300,
	"max_runtime_seconds" integer,
	"status" "monitor_status" DEFAULT 'healthy' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"last_ping_at" timestamp with time zone,
	"next_expected_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0,
	"is_paused" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitors_slug_unique" UNIQUE("slug"),
	CONSTRAINT "monitors_ping_uuid_unique" UNIQUE("ping_uuid")
);
--> statement-breakpoint
CREATE TABLE "pings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_id" uuid NOT NULL,
	"type" "ping_type" NOT NULL,
	"body" text,
	"duration_ms" integer,
	"user_agent" varchar(255),
	"source_ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_id" uuid NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"reason" varchar(255),
	"missed_pings_count" integer DEFAULT 0,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"downtime_seconds" integer
);
--> statement-breakpoint
CREATE TABLE "alert_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_id" uuid NOT NULL,
	"channel" "alert_channel" NOT NULL,
	"destination" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"cooldown_minutes" integer DEFAULT 30,
	"threshold_failures" integer DEFAULT 1,
	"is_enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"alert_config_id" uuid NOT NULL,
	"channel" "alert_channel" NOT NULL,
	"status" "alert_delivery_status" NOT NULL,
	"attempts" integer DEFAULT 1,
	"last_error" text,
	"response" jsonb,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_prefix" varchar(8) NOT NULL,
	"label" varchar(255),
	"team_id" uuid,
	"scopes" jsonb DEFAULT '["read","write"]'::jsonb,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "pings" ADD CONSTRAINT "pings_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_configs" ADD CONSTRAINT "alert_configs_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_log" ADD CONSTRAINT "alert_log_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_log" ADD CONSTRAINT "alert_log_alert_config_id_alert_configs_id_fk" FOREIGN KEY ("alert_config_id") REFERENCES "public"."alert_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitors_status_idx" ON "monitors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "monitors_ping_uuid_idx" ON "monitors" USING btree ("ping_uuid");--> statement-breakpoint
CREATE INDEX "pings_monitor_idx" ON "pings" USING btree ("monitor_id");--> statement-breakpoint
CREATE INDEX "pings_created_at_idx" ON "pings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pings_monitor_created_idx" ON "pings" USING btree ("monitor_id","created_at");--> statement-breakpoint
CREATE INDEX "incidents_monitor_idx" ON "incidents" USING btree ("monitor_id");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "alert_log_incident_idx" ON "alert_log" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "alert_log_status_idx" ON "alert_log" USING btree ("status");
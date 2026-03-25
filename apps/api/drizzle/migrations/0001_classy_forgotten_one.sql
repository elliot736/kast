ALTER TYPE "public"."incident_status" ADD VALUE 'acknowledged' BEFORE 'resolved';--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "log_retention_days" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "acknowledged_by" varchar(255);--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
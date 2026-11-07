CREATE TABLE "deliverable_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid,
	"issue_id" uuid,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"target_version" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"reviewer_user_id" text,
	"reviewer_agent_id" uuid,
	"reason" text,
	"evidence" jsonb,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliverable_reviews_target_kind_check" CHECK ("deliverable_reviews"."target_kind" in ('work_product', 'company_file_version', 'document_revision')),
	CONSTRAINT "deliverable_reviews_state_check" CHECK ("deliverable_reviews"."state" in ('pending', 'accepted', 'changes_requested'))
);
--> statement-breakpoint
CREATE TABLE "media_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_asset_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"cost_cents" numeric(24, 7) DEFAULT 0 NOT NULL,
	"provider" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_jobs_kind_check" CHECK ("media_jobs"."kind" in ('transcribe', 'render', 'dub')),
	CONSTRAINT "media_jobs_status_check" CHECK ("media_jobs"."status" in ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "media_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid,
	"issue_id" uuid,
	"source_asset_id" uuid NOT NULL,
	"transcript_document_id" uuid,
	"operations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_events" DROP CONSTRAINT "cost_events_usage_kind_check";--> statement-breakpoint
ALTER TABLE "company_files" ADD COLUMN "audience_kind" text DEFAULT 'company' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_files" ADD COLUMN "audience_id" uuid;--> statement-breakpoint
ALTER TABLE "company_files" ADD COLUMN "valid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_files" ADD COLUMN "context_role" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "kind" text DEFAULT 'goal' NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "acceptance_criteria" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "expected_deliverable" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "budget_cents" integer;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "assignee_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "root_issue_id" uuid;--> statement-breakpoint
ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_reviewer_agent_id_agents_id_fk" FOREIGN KEY ("reviewer_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_project_id_media_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."media_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_output_asset_id_assets_id_fk" FOREIGN KEY ("output_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_projects" ADD CONSTRAINT "media_projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_projects" ADD CONSTRAINT "media_projects_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_projects" ADD CONSTRAINT "media_projects_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_projects" ADD CONSTRAINT "media_projects_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_projects" ADD CONSTRAINT "media_projects_transcript_document_id_documents_id_fk" FOREIGN KEY ("transcript_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_projects" ADD CONSTRAINT "media_projects_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliverable_reviews_company_target_idx" ON "deliverable_reviews" USING btree ("company_id","target_kind","target_id");--> statement-breakpoint
CREATE INDEX "deliverable_reviews_company_goal_state_idx" ON "deliverable_reviews" USING btree ("company_id","goal_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "deliverable_reviews_pending_version_uq" ON "deliverable_reviews" USING btree ("company_id","target_kind","target_id","target_version") WHERE "deliverable_reviews"."state" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "media_jobs_company_idempotency_uq" ON "media_jobs" USING btree ("company_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "media_jobs_queue_idx" ON "media_jobs" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "media_projects_company_goal_idx" ON "media_projects" USING btree ("company_id","goal_id");--> statement-breakpoint
CREATE INDEX "media_projects_company_issue_idx" ON "media_projects" USING btree ("company_id","issue_id");--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_assignee_agent_id_agents_id_fk" FOREIGN KEY ("assignee_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_root_issue_id_issues_id_fk" FOREIGN KEY ("root_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_files_company_audience_idx" ON "company_files" USING btree ("company_id","audience_kind","audience_id");--> statement-breakpoint
CREATE INDEX "cost_events_company_goal_occurred_idx" ON "cost_events" USING btree ("company_id","goal_id","occurred_at");--> statement-breakpoint
CREATE INDEX "goals_company_kind_status_idx" ON "goals" USING btree ("company_id","kind","status");--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_usage_kind_check" CHECK ("cost_events"."usage_kind" in ('decision', 'fast_response', 'media') or ("cost_events"."usage_kind" = 'agent' and "cost_events"."agent_id" is not null));
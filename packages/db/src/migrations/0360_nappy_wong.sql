CREATE TABLE "autonomy_bench_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"sample_size" integer NOT NULL,
	"cases_evaluated" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"score" numeric(6, 3),
	"threshold" numeric(6, 3),
	"failures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_cents" numeric(24, 7) DEFAULT 0 NOT NULL,
	"judge_model" text,
	"error" text,
	"created_by_user_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autonomy_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid,
	"action_type" text NOT NULL,
	"level" text NOT NULL,
	"granted_by_user_id" text,
	"granted_by_agent_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"bench_run_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autonomy_shadow_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"period_start" date NOT NULL,
	"drafts" integer DEFAULT 0 NOT NULL,
	"sent_unchanged" integer DEFAULT 0 NOT NULL,
	"edited" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_remote_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"decision_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"recipient_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_option_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_brief_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"hour_local" integer DEFAULT 8 NOT NULL,
	"timezone" text DEFAULT 'Europe/Madrid' NOT NULL,
	"last_sent_on" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoff_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"customer_id" uuid,
	"project_id" uuid,
	"assignment_goal_id" uuid,
	"team_catalog_key" text,
	"status" text DEFAULT 'partial' NOT NULL,
	"steps_done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"playbook_id" uuid NOT NULL,
	"playbook_version" integer NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"agent_id" uuid,
	"current_step_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"next_action_at" timestamp with time zone,
	"last_action_at" timestamp with time zone,
	"last_routine_id" uuid,
	"last_run_id" uuid,
	"attempts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text,
	"failure_reason" text,
	"started_by_agent_id" uuid,
	"started_by_user_id" text,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scope_kind" text DEFAULT 'lead_type' NOT NULL,
	"scope_value" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"criteria_version" text NOT NULL,
	"score" integer NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enrichment" jsonb,
	"agent_id" uuid,
	"run_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"proposal_key" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"opportunity_id" uuid,
	"customer_id" uuid,
	"title" text NOT NULL,
	"scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"terms" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"deposit_cents" integer,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"valid_until" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"document_id" uuid,
	"public_token" text,
	"acceptance_evidence" jsonb,
	"stripe_payment_link_id" text,
	"stripe_payment_link_url" text,
	"payment_status" text DEFAULT 'none' NOT NULL,
	"paid_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agreement_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"assignment_goal_id" uuid,
	"renewal_proposal_id" uuid,
	"renewal_decision_id" uuid,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid,
	"proposal_id" uuid,
	"title" text NOT NULL,
	"period_kind" text DEFAULT 'monthly' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"deliverables_per_period" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"notice_days" integer DEFAULT 30 NOT NULL,
	"assignee_agent_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_events" DROP CONSTRAINT "cost_events_usage_kind_check";--> statement-breakpoint
ALTER TABLE "media_jobs" DROP CONSTRAINT "media_jobs_kind_check";--> statement-breakpoint
ALTER TABLE "autonomy_bench_runs" ADD CONSTRAINT "autonomy_bench_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomy_bench_runs" ADD CONSTRAINT "autonomy_bench_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomy_policies" ADD CONSTRAINT "autonomy_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomy_policies" ADD CONSTRAINT "autonomy_policies_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomy_policies" ADD CONSTRAINT "autonomy_policies_granted_by_agent_id_agents_id_fk" FOREIGN KEY ("granted_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomy_shadow_stats" ADD CONSTRAINT "autonomy_shadow_stats_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomy_shadow_stats" ADD CONSTRAINT "autonomy_shadow_stats_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_remote_tokens" ADD CONSTRAINT "decision_remote_tokens_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_remote_tokens" ADD CONSTRAINT "decision_remote_tokens_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_brief_preferences" ADD CONSTRAINT "daily_brief_preferences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_receipts" ADD CONSTRAINT "handoff_receipts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_receipts" ADD CONSTRAINT "handoff_receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_receipts" ADD CONSTRAINT "handoff_receipts_assignment_goal_id_goals_id_fk" FOREIGN KEY ("assignment_goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_playbook_id_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_last_routine_id_routines_id_fk" FOREIGN KEY ("last_routine_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_last_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_started_by_agent_id_agents_id_fk" FOREIGN KEY ("started_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD CONSTRAINT "lead_qualifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD CONSTRAINT "lead_qualifications_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_qualifications" ADD CONSTRAINT "lead_qualifications_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_periods" ADD CONSTRAINT "agreement_periods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_periods" ADD CONSTRAINT "agreement_periods_agreement_id_service_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_periods" ADD CONSTRAINT "agreement_periods_assignment_goal_id_goals_id_fk" FOREIGN KEY ("assignment_goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_periods" ADD CONSTRAINT "agreement_periods_renewal_proposal_id_proposals_id_fk" FOREIGN KEY ("renewal_proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "autonomy_bench_runs_company_agent_action_idx" ON "autonomy_bench_runs" USING btree ("company_id","agent_id","action_type","created_at");--> statement-breakpoint
CREATE INDEX "autonomy_bench_runs_company_status_idx" ON "autonomy_bench_runs" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "autonomy_policies_company_agent_action_idx" ON "autonomy_policies" USING btree ("company_id","agent_id","action_type","granted_at");--> statement-breakpoint
CREATE INDEX "autonomy_policies_company_active_idx" ON "autonomy_policies" USING btree ("company_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "autonomy_shadow_stats_period_uq" ON "autonomy_shadow_stats" USING btree ("company_id","agent_id","action_type","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "decision_remote_tokens_hash_uq" ON "decision_remote_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "decision_remote_tokens_decision_idx" ON "decision_remote_tokens" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "decision_remote_tokens_company_expires_idx" ON "decision_remote_tokens" USING btree ("company_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_brief_preferences_company_user_uq" ON "daily_brief_preferences" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "handoff_receipts_company_source_uq" ON "handoff_receipts" USING btree ("company_id","source_kind","source_id");--> statement-breakpoint
CREATE INDEX "handoff_receipts_company_status_idx" ON "handoff_receipts" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "playbook_runs_company_subject_idx" ON "playbook_runs" USING btree ("company_id","subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "playbook_runs_next_action_idx" ON "playbook_runs" USING btree ("next_action_at");--> statement-breakpoint
CREATE INDEX "playbook_runs_company_status_idx" ON "playbook_runs" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "playbook_runs_company_idempotency_uq" ON "playbook_runs" USING btree ("company_id","idempotency_key") WHERE "playbook_runs"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "playbooks_company_key_version_uq" ON "playbooks" USING btree ("company_id","key","version");--> statement-breakpoint
CREATE INDEX "playbooks_company_status_idx" ON "playbooks" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "playbooks_company_scope_idx" ON "playbooks" USING btree ("company_id","scope_kind","scope_value");--> statement-breakpoint
CREATE INDEX "lead_qualifications_company_lead_created_idx" ON "lead_qualifications" USING btree ("company_id","lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_company_key_revision_uq" ON "proposals" USING btree ("company_id","proposal_key","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_public_token_uq" ON "proposals" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "proposals_company_opportunity_idx" ON "proposals" USING btree ("company_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "proposals_company_status_idx" ON "proposals" USING btree ("company_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_periods_agreement_start_uq" ON "agreement_periods" USING btree ("agreement_id","period_start");--> statement-breakpoint
CREATE INDEX "agreement_periods_company_status_idx" ON "agreement_periods" USING btree ("company_id","status","period_end");--> statement-breakpoint
CREATE INDEX "service_agreements_company_status_idx" ON "service_agreements" USING btree ("company_id","status","ends_at");--> statement-breakpoint
CREATE INDEX "service_agreements_company_customer_idx" ON "service_agreements" USING btree ("company_id","customer_id");--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_usage_kind_check" CHECK ("cost_events"."usage_kind" in ('decision', 'fast_response', 'media', 'enrichment', 'autonomy_bench') or ("cost_events"."usage_kind" = 'agent' and "cost_events"."agent_id" is not null));--> statement-breakpoint
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_kind_check" CHECK ("media_jobs"."kind" in ('transcribe', 'render', 'dub', 'stop_motion', 'dub_multivoice', 'voiceover'));
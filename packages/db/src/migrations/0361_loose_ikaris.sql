CREATE TABLE "booking_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"weekly_hours" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"host_agent_id" uuid,
	"host_user_id" text,
	"connection_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_types_duration_check" CHECK ("booking_types"."duration_minutes" > 0),
	CONSTRAINT "booking_types_buffer_check" CHECK ("booking_types"."buffer_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text DEFAULT 'google_calendar' NOT NULL,
	"external_id" text,
	"connection_id" uuid,
	"booking_type_id" uuid,
	"host_agent_id" uuid,
	"host_user_id" text,
	"contact_id" uuid,
	"customer_id" uuid,
	"opportunity_id" uuid,
	"kind" text DEFAULT 'meeting' NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"attendee_name" text,
	"attendee_email" text,
	"attendee_phone" text,
	"meeting_link" text,
	"external_action_id" uuid,
	"provider_receipt" jsonb,
	"idempotency_key" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_status_check" CHECK ("calendar_events"."status" in ('proposed', 'confirmed', 'cancelled')),
	CONSTRAINT "calendar_events_range_check" CHECK ("calendar_events"."ends_at" > "calendar_events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"who" text NOT NULL,
	"what" text NOT NULL,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"customer_id" uuid,
	"contact_id" uuid,
	"opportunity_id" uuid,
	"conversation_id" uuid,
	"evidence" jsonb,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commitments_who_check" CHECK ("commitments"."who" in ('us', 'them')),
	CONSTRAINT "commitments_status_check" CHECK ("commitments"."status" in ('proposed', 'open', 'kept', 'missed', 'cancelled')),
	CONSTRAINT "commitments_source_check" CHECK ("commitments"."source" in ('manual', 'detected'))
);
--> statement-breakpoint
CREATE TABLE "contact_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"identifier" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_identities_channel_check" CHECK ("contact_identities"."channel" in ('email', 'phone', 'whatsapp', 'messenger', 'instagram', 'telegram', 'webchat'))
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"first_name" text,
	"last_name" text,
	"display_name" text NOT NULL,
	"primary_email" text,
	"primary_phone" text,
	"title" text,
	"language" text,
	"preferred_channel" text,
	"consents" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_status_check" CHECK ("contacts"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "customer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" text,
	"actor_agent_id" uuid,
	"body" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text,
	"delivery_status" text DEFAULT 'draft' NOT NULL,
	"provider" text,
	"provider_message_id" text,
	"provider_receipt" jsonb,
	"external_action_id" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_messages_direction_check" CHECK ("conversation_messages"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "conversation_messages_actor_kind_check" CHECK ("conversation_messages"."actor_kind" in ('contact', 'user', 'agent', 'system')),
	CONSTRAINT "conversation_messages_delivery_status_check" CHECK ("conversation_messages"."delivery_status" in ('draft', 'queued', 'sent', 'delivered', 'read', 'failed', 'uncertain'))
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"contact_id" uuid,
	"customer_id" uuid,
	"opportunity_id" uuid,
	"lead_id" uuid,
	"external_thread_id" text,
	"subject" text,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"sla_due_at" timestamp with time zone,
	"assigned_user_id" text,
	"assigned_agent_id" uuid,
	"last_message_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_channel_check" CHECK ("conversations"."channel" in ('email', 'whatsapp', 'messenger', 'instagram', 'telegram', 'webchat', 'voice', 'sms')),
	CONSTRAINT "conversations_status_check" CHECK ("conversations"."status" in ('open', 'waiting_us', 'waiting_them', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "crm_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" text,
	"actor_agent_id" uuid,
	"summary" text NOT NULL,
	"payload" jsonb,
	"external_ref" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_activities_subject_kind_check" CHECK ("crm_activities"."subject_kind" in ('customer', 'contact', 'lead', 'opportunity', 'conversation', 'commitment')),
	CONSTRAINT "crm_activities_kind_check" CHECK ("crm_activities"."kind" in ('note', 'call', 'email', 'message', 'meeting', 'stage_change', 'status_change', 'task', 'system'))
);
--> statement-breakpoint
CREATE TABLE "customer_channel_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"external_account_id" text NOT NULL,
	"provider_account_sid" text,
	"verify_secret_name" text NOT NULL,
	"challenge_secret_name" text,
	"token_secret_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_templates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_channel_accounts_provider_check" CHECK ("customer_channel_accounts"."provider" in ('meta', 'telegram', 'twilio')),
	CONSTRAINT "customer_channel_accounts_kind_check" CHECK ("customer_channel_accounts"."kind" in ('whatsapp', 'messenger', 'instagram', 'telegram', 'sms')),
	CONSTRAINT "customer_channel_accounts_status_check" CHECK ("customer_channel_accounts"."status" in ('pending', 'active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "customer_memory_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"key" text NOT NULL,
	"content" text NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"agent_id" uuid,
	"run_id" uuid,
	"valid_until" timestamp with time zone,
	"idempotency_key" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_memory_notes_source_check" CHECK ("customer_memory_notes"."source" in ('user', 'agent', 'detected'))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text DEFAULT 'organization' NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_user_id" text,
	"owner_agent_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"health" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_kind_check" CHECK ("customers"."kind" in ('person', 'organization')),
	CONSTRAINT "customers_status_check" CHECK ("customers"."status" in ('active', 'archived')),
	CONSTRAINT "customers_health_check" CHECK ("customers"."health" is null or "customers"."health" in ('good', 'watch', 'risk'))
);
--> statement-breakpoint
CREATE TABLE "external_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"actor_agent_id" uuid,
	"actor_user_id" text,
	"subject_kind" text,
	"subject_id" uuid,
	"level_applied" text NOT NULL,
	"mode" text NOT NULL,
	"approval_id" uuid,
	"decision_id" uuid,
	"payload_hash" text,
	"idempotency_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_actions_mode_check" CHECK ("external_actions"."mode" in ('draft', 'approval', 'direct')),
	CONSTRAINT "external_actions_status_check" CHECK ("external_actions"."status" in ('pending', 'approved', 'rejected', 'executed', 'failed', 'uncertain'))
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text,
	"language" text,
	"contact_id" uuid,
	"customer_id" uuid,
	"opportunity_id" uuid,
	"conversation_id" uuid,
	"assigned_user_id" text,
	"assigned_agent_id" uuid,
	"discard_reason" text,
	"converted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_source_check" CHECK ("leads"."source" in ('form', 'csv', 'email', 'whatsapp', 'messenger', 'instagram', 'telegram', 'webchat', 'voice', 'manual', 'api')),
	CONSTRAINT "leads_status_check" CHECK ("leads"."status" in ('new', 'triaged', 'qualified', 'converted', 'discarded')),
	CONSTRAINT "leads_priority_check" CHECK ("leads"."priority" is null or "leads"."priority" in ('low', 'normal', 'high'))
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"primary_contact_id" uuid,
	"title" text NOT NULL,
	"pipeline_id" uuid,
	"stage_id" uuid,
	"stage_key" text,
	"amount_cents" integer,
	"currency" text,
	"probability" integer,
	"expected_close_at" timestamp with time zone,
	"next_action" text,
	"next_action_at" timestamp with time zone,
	"owner_user_id" text,
	"owner_agent_id" uuid,
	"source" text,
	"status" text DEFAULT 'open' NOT NULL,
	"lost_reason" text,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_status_check" CHECK ("opportunities"."status" in ('open', 'won', 'lost')),
	CONSTRAINT "opportunities_probability_check" CHECK ("opportunities"."probability" is null or ("opportunities"."probability" >= 0 and "opportunities"."probability" <= 100))
);
--> statement-breakpoint
CREATE TABLE "lead_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webchat_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"greeting" text,
	"brand_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_types" ADD CONSTRAINT "booking_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_types" ADD CONSTRAINT "booking_types_host_agent_id_agents_id_fk" FOREIGN KEY ("host_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_types" ADD CONSTRAINT "booking_types_connection_id_tool_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."tool_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_connection_id_tool_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."tool_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_booking_type_id_booking_types_id_fk" FOREIGN KEY ("booking_type_id") REFERENCES "public"."booking_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_host_agent_id_agents_id_fk" FOREIGN KEY ("host_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_actor_agent_id_agents_id_fk" FOREIGN KEY ("actor_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_agent_id_agents_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_actor_agent_id_agents_id_fk" FOREIGN KEY ("actor_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_channel_accounts" ADD CONSTRAINT "customer_channel_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_memory_notes" ADD CONSTRAINT "customer_memory_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_memory_notes" ADD CONSTRAINT "customer_memory_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_memory_notes" ADD CONSTRAINT "customer_memory_notes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_memory_notes" ADD CONSTRAINT "customer_memory_notes_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_actions" ADD CONSTRAINT "external_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_actions" ADD CONSTRAINT "external_actions_actor_agent_id_agents_id_fk" FOREIGN KEY ("actor_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_agent_id_agents_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webchat_settings" ADD CONSTRAINT "webchat_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_types_company_updated_idx" ON "booking_types" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_types_company_slug_uq" ON "booking_types" USING btree ("company_id","slug");--> statement-breakpoint
CREATE INDEX "calendar_events_company_updated_idx" ON "calendar_events" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "calendar_events_company_starts_idx" ON "calendar_events" USING btree ("company_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_company_idempotency_uq" ON "calendar_events" USING btree ("company_id","idempotency_key") WHERE "calendar_events"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "commitments_company_updated_idx" ON "commitments" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "commitments_company_status_due_idx" ON "commitments" USING btree ("company_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identities_company_channel_identifier_uq" ON "contact_identities" USING btree ("company_id","channel","identifier");--> statement-breakpoint
CREATE INDEX "contact_identities_company_updated_idx" ON "contact_identities" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "contact_identities_contact_idx" ON "contact_identities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contacts_company_updated_idx" ON "contacts" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "contacts_company_email_idx" ON "contacts" USING btree ("company_id","primary_email");--> statement-breakpoint
CREATE INDEX "contacts_company_phone_idx" ON "contacts" USING btree ("company_id","primary_phone");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_contacts_customer_contact_uq" ON "customer_contacts" USING btree ("customer_id","contact_id");--> statement-breakpoint
CREATE INDEX "customer_contacts_company_updated_idx" ON "customer_contacts" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "customer_contacts_contact_idx" ON "customer_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_company_updated_idx" ON "conversation_messages" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_created_idx" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_company_provider_message_uq" ON "conversation_messages" USING btree ("company_id","provider","provider_message_id") WHERE "conversation_messages"."provider_message_id" is not null;--> statement-breakpoint
CREATE INDEX "conversations_company_updated_idx" ON "conversations" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_company_status_last_idx" ON "conversations" USING btree ("company_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_company_contact_idx" ON "conversations" USING btree ("company_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_company_channel_thread_uq" ON "conversations" USING btree ("company_id","channel","external_thread_id") WHERE "conversations"."external_thread_id" is not null;--> statement-breakpoint
CREATE INDEX "crm_activities_company_updated_idx" ON "crm_activities" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "crm_activities_company_subject_occurred_idx" ON "crm_activities" USING btree ("company_id","subject_kind","subject_id","occurred_at");--> statement-breakpoint
CREATE INDEX "customer_channel_accounts_company_updated_idx" ON "customer_channel_accounts" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_channel_accounts_company_provider_identifier_uq" ON "customer_channel_accounts" USING btree ("company_id","provider","external_account_id");--> statement-breakpoint
CREATE INDEX "customer_memory_notes_company_updated_idx" ON "customer_memory_notes" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_memory_notes_company_idempotency_uq" ON "customer_memory_notes" USING btree ("company_id","idempotency_key") WHERE "customer_memory_notes"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "customer_memory_notes_customer_key_idx" ON "customer_memory_notes" USING btree ("customer_id","key","created_at");--> statement-breakpoint
CREATE INDEX "customers_company_updated_idx" ON "customers" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "customers_company_status_idx" ON "customers" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "customers_company_domain_idx" ON "customers" USING btree ("company_id","domain");--> statement-breakpoint
CREATE INDEX "customers_name_search_idx" ON "customers" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "external_actions_company_updated_idx" ON "external_actions" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "external_actions_company_idempotency_uq" ON "external_actions" USING btree ("company_id","idempotency_key") WHERE "external_actions"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "leads_company_updated_idx" ON "leads" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "leads_company_status_idx" ON "leads" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_company_source_source_ref_uq" ON "leads" USING btree ("company_id","source","source_ref") WHERE "leads"."source_ref" is not null;--> statement-breakpoint
CREATE INDEX "opportunities_company_updated_idx" ON "opportunities" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "opportunities_company_status_idx" ON "opportunities" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "opportunities_company_customer_idx" ON "opportunities" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE INDEX "opportunities_company_next_action_idx" ON "opportunities" USING btree ("company_id","next_action_at");--> statement-breakpoint
CREATE INDEX "lead_forms_company_updated_idx" ON "lead_forms" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_forms_company_slug_uq" ON "lead_forms" USING btree ("company_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "webchat_settings_company_uq" ON "webchat_settings" USING btree ("company_id");
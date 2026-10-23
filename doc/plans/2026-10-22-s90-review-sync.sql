-- S90 pistas I + L: revisión externa de entregables y sincronización CRM.
-- Propuesta para la migración central (la numera y registra el orquestador; no se ha ejecutado).
-- Debe coincidir con packages/db/src/schema/review_links.ts y crm_sync.ts.

CREATE TABLE IF NOT EXISTS "review_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "issue_id" uuid REFERENCES "issues"("id") ON DELETE SET NULL,
  "target_kind" text DEFAULT 'work_product' NOT NULL,
  "target_id" uuid NOT NULL,
  "target_version" text NOT NULL,
  "target_title" text NOT NULL,
  "deliverable_review_id" uuid REFERENCES "deliverable_reviews"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'pending_approval' NOT NULL,
  "decision" text DEFAULT 'open' NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "idempotency_key" text NOT NULL,
  "external_action_id" uuid,
  "approval_id" uuid,
  "created_by_user_id" text,
  "created_by_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "created_by_run_id" uuid,
  "token_issued_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by_user_id" text,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "review_links_target_kind_check" CHECK ("target_kind" = 'work_product'),
  CONSTRAINT "review_links_status_check" CHECK ("status" in ('pending_approval', 'active', 'revoked', 'rejected')),
  CONSTRAINT "review_links_decision_check" CHECK ("decision" in ('open', 'accepted', 'changes_requested'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "review_links_company_idempotency_uq" ON "review_links" ("company_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "review_links_company_target_idx" ON "review_links" ("company_id", "target_kind", "target_id");
CREATE INDEX IF NOT EXISTS "review_links_company_customer_idx" ON "review_links" ("company_id", "customer_id", "created_at");

CREATE TABLE IF NOT EXISTS "review_link_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "link_id" uuid NOT NULL REFERENCES "review_links"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "author_label" text,
  "target_version" text NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "request_hash" text NOT NULL,
  "revision_after" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "review_link_events_kind_check" CHECK ("kind" in ('comment', 'accept', 'request_changes'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "review_link_events_link_key_uq" ON "review_link_events" ("link_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "review_link_events_link_idx" ON "review_link_events" ("link_id", "created_at");

CREATE TABLE IF NOT EXISTS "crm_sync_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "connection_id" uuid REFERENCES "tool_connections"("id") ON DELETE SET NULL,
  "direction" text DEFAULT 'both' NOT NULL,
  "primary_system" text DEFAULT 'manual' NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "tool_names" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "disconnected_at" timestamp with time zone,
  "updated_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_sync_configs_provider_check" CHECK ("provider" in ('hubspot', 'pipedrive')),
  CONSTRAINT "crm_sync_configs_direction_check" CHECK ("direction" in ('import', 'export', 'both')),
  CONSTRAINT "crm_sync_configs_primary_check" CHECK ("primary_system" in ('paperclip', 'external', 'manual'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sync_configs_company_provider_uq" ON "crm_sync_configs" ("company_id", "provider");

CREATE TABLE IF NOT EXISTS "crm_sync_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "entity_kind" text NOT NULL,
  "local_id" uuid NOT NULL,
  "external_id" text,
  "status" text DEFAULT 'linked' NOT NULL,
  "local_hash" text,
  "external_hash" text,
  "external_updated_at" text,
  "conflict" jsonb,
  "receipt" jsonb,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_sync_links_kind_check" CHECK ("entity_kind" in ('customer', 'contact')),
  CONSTRAINT "crm_sync_links_status_check" CHECK ("status" in ('linked', 'conflict', 'uncertain', 'error'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sync_links_local_uq" ON "crm_sync_links" ("company_id", "provider", "entity_kind", "local_id");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sync_links_external_uq" ON "crm_sync_links" ("company_id", "provider", "entity_kind", "external_id") WHERE "external_id" is not null;
CREATE INDEX IF NOT EXISTS "crm_sync_links_status_idx" ON "crm_sync_links" ("company_id", "provider", "status");

CREATE TABLE IF NOT EXISTS "crm_sync_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "direction" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "idempotency_key" text NOT NULL,
  "requested_by_user_id" text,
  "cursors" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "blocked_reason" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "lease_expires_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_sync_jobs_status_check" CHECK ("status" in ('queued', 'running', 'succeeded', 'partial', 'failed', 'blocked')),
  CONSTRAINT "crm_sync_jobs_direction_check" CHECK ("direction" in ('import', 'export', 'both'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sync_jobs_company_idempotency_uq" ON "crm_sync_jobs" ("company_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "crm_sync_jobs_company_provider_idx" ON "crm_sync_jobs" ("company_id", "provider", "created_at");
CREATE INDEX IF NOT EXISTS "crm_sync_jobs_status_idx" ON "crm_sync_jobs" ("status", "lease_expires_at");

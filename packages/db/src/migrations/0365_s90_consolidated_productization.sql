-- Consolidated additive S90 schema changes after 0364. Manually assembled from source fragments; not executed.
-- Source fragment only. Root owns the consolidated migration.
ALTER TABLE booking_types
  ADD COLUMN IF NOT EXISTS public_execution_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delegated_by_user_id text,
  ADD COLUMN IF NOT EXISTS delegated_at timestamptz;--> statement-breakpoint

ALTER TABLE booking_types
  ADD CONSTRAINT booking_types_public_execution_delegation_check
  CHECK (
    NOT public_execution_enabled
    OR (
      connection_id IS NOT NULL
      AND ((host_agent_id IS NOT NULL) <> (host_user_id IS NOT NULL))
      AND delegated_by_user_id IS NOT NULL
      AND delegated_at IS NOT NULL
    )
  );--> statement-breakpoint

-- Source schema fragment for the S3 renewal handoff. Migration generation/execution
-- is intentionally left to the owning integration branch.
ALTER TABLE agreement_periods
  ADD COLUMN renewal_task_id uuid REFERENCES goals(id) ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE daily_brief_preferences
  ADD COLUMN delivery_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE daily_brief_preferences
  ADD COLUMN pending_task_id uuid REFERENCES goals(id) ON DELETE SET NULL;--> statement-breakpoint

-- `status` is text without a check constraint; the new saga state is
-- `renewal_requested_pending_run`.

CREATE TABLE commercial_automation_cursors (
  lane text PRIMARY KEY,
  last_source_id uuid,
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- Durable 80% / 100% account-level quota notices.
-- The Drizzle schema is packages/db/src/schema/productization_accounts.ts;--> statement-breakpoint
-- schema export and generated migration are owned by the integration root.
CREATE TABLE product_account_usage_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES product_accounts(id) ON DELETE CASCADE,
  metric text NOT NULL,
  period_key text NOT NULL,
  threshold integer NOT NULL,
  consumed numeric(24, 7) NOT NULL,
  "limit" numeric(24, 7) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_account_usage_notifications_threshold_check
    CHECK (threshold IN (80, 100))
);--> statement-breakpoint

CREATE UNIQUE INDEX product_account_usage_notifications_dedupe_uidx
  ON product_account_usage_notifications (account_id, metric, period_key, threshold);--> statement-breakpoint
CREATE INDEX product_account_usage_notifications_recent_idx
  ON product_account_usage_notifications (account_id, created_at);--> statement-breakpoint

-- S90 catálogo: instalación de recursos de paquete (playbooks, formularios, presets de marca, plantillas de encargo).
-- Fragmento aditivo para que el integrador lo consolide en una migración NUEVA (0364 ya contiene las tres tablas del
-- catálogo; no se edita). No se tocó journal, snapshots ni migraciones. Nada de esto se ha ejecutado.
-- Orden: ítems (columnas, índices, checks) → tablas de borradores.

-- 1) Recibo por recurso: tipo, identidad de dominio, huella de la fuente, enlace al registro creado y resultado.
ALTER TABLE productization_package_installation_items
  ADD COLUMN domain_identity text,
  ADD COLUMN source_content_hash text,
  ADD COLUMN resource_id uuid,
  ADD COLUMN result jsonb;--> statement-breakpoint

-- Identidad única por empresa y tipo: dos recibos no pueden reservar la misma clave/slug.
CREATE UNIQUE INDEX productization_package_installation_items_identity_uq
  ON productization_package_installation_items(company_id, kind, domain_identity)
  WHERE domain_identity IS NOT NULL;--> statement-breakpoint
-- Un registro de dominio solo puede estar enlazado por un ítem (resource_id es polimórfico por kind: sin FK).
CREATE UNIQUE INDEX productization_package_installation_items_resource_uq
  ON productization_package_installation_items(kind, resource_id)
  WHERE resource_id IS NOT NULL;--> statement-breakpoint

ALTER TABLE productization_package_installation_items
  ADD CONSTRAINT productization_package_installation_items_kind_check
  CHECK (kind in ('persistent_agent','playbook','lead_form','brand_preset','request_template'));--> statement-breakpoint

-- Estados nuevos de recurso: creating (reclamado, reanudable), created (enlazado), conflict (identidad ocupada por otra cosa).
ALTER TABLE productization_package_installation_items
  DROP CONSTRAINT productization_package_installation_items_status_check;--> statement-breakpoint
ALTER TABLE productization_package_installation_items
  ADD CONSTRAINT productization_package_installation_items_status_check
  CHECK (status in ('planned','submitting','pending_approval','hired','unknown','blocked','cancelled','creating','created','conflict'));--> statement-breakpoint

-- 2) Presets de marca instalados desde paquetes (borrador inerte).
CREATE TABLE productization_brand_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  preset_key text NOT NULL,
  name text NOT NULL,
  voice text NOT NULL,
  audience text NOT NULL,
  preferred_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  avoided_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_color text,
  accent_color text,
  status text NOT NULL DEFAULT 'draft',
  source_package_key text NOT NULL,
  source_package_version text NOT NULL,
  source_local_id text NOT NULL,
  source_content_hash text NOT NULL,
  -- Ítem del recibo que lo creó; id simple (sin FK) para que descartar un recibo nunca borre el registro.
  source_item_id uuid NOT NULL,
  created_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_brand_presets_status_check CHECK (status in ('draft','active','archived'))
);--> statement-breakpoint
CREATE UNIQUE INDEX productization_brand_presets_company_key_uq
  ON productization_brand_presets(company_id, preset_key);--> statement-breakpoint
CREATE UNIQUE INDEX productization_brand_presets_provenance_uq
  ON productization_brand_presets(company_id, source_package_key, source_package_version, source_local_id);--> statement-breakpoint
CREATE UNIQUE INDEX productization_brand_presets_source_item_uq
  ON productization_brand_presets(source_item_id);--> statement-breakpoint
CREATE INDEX productization_brand_presets_company_status_idx
  ON productization_brand_presets(company_id, status);--> statement-breakpoint

-- 3) Plantillas de encargo instaladas desde paquetes (borrador; no crean encargos ni inician playbooks).
CREATE TABLE productization_request_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  name text NOT NULL,
  outcome text NOT NULL,
  acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_deliverable text NOT NULL,
  suggested_playbooks jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  source_package_key text NOT NULL,
  source_package_version text NOT NULL,
  source_local_id text NOT NULL,
  source_content_hash text NOT NULL,
  source_item_id uuid NOT NULL,
  created_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_request_templates_status_check CHECK (status in ('draft','active','archived'))
);--> statement-breakpoint
CREATE UNIQUE INDEX productization_request_templates_company_key_uq
  ON productization_request_templates(company_id, template_key);--> statement-breakpoint
CREATE UNIQUE INDEX productization_request_templates_provenance_uq
  ON productization_request_templates(company_id, source_package_key, source_package_version, source_local_id);--> statement-breakpoint
CREATE UNIQUE INDEX productization_request_templates_source_item_uq
  ON productization_request_templates(source_item_id);--> statement-breakpoint
CREATE INDEX productization_request_templates_company_status_idx
  ON productization_request_templates(company_id, status);--> statement-breakpoint

-- 4) Procedencia durable en playbooks y formularios instalados. Null para filas no provenientes del catálogo.
ALTER TABLE playbooks
  ADD COLUMN installation_item_id uuid,
  ADD COLUMN installation_source_content_hash text;--> statement-breakpoint
CREATE UNIQUE INDEX playbooks_installation_item_uq
  ON playbooks(installation_item_id)
  WHERE installation_item_id IS NOT NULL;--> statement-breakpoint

ALTER TABLE lead_forms
  ADD COLUMN installation_item_id uuid,
  ADD COLUMN installation_source_content_hash text;--> statement-breakpoint
CREATE UNIQUE INDEX lead_forms_installation_item_uq
  ON lead_forms(installation_item_id)
  WHERE installation_item_id IS NOT NULL;--> statement-breakpoint

-- Source schema fragment for the S2 G phone bridge (crm_phone_calls, crm_phone_callbacks).
-- Mirrors packages/db/src/schema/crm_phone.ts. Migration generation/execution is left to the
-- owning integration branch; do not hand-apply this file.
CREATE TABLE crm_phone_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL,
  session_id uuid NOT NULL,
  provider_session_id text NOT NULL,
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES crm_activities(id) ON DELETE SET NULL,
  identity_state text NOT NULL DEFAULT 'unresolved',
  identity_basis text,
  caller_phone_e164 text,
  report_status text NOT NULL,
  summary jsonb NOT NULL,
  report_provider_updated_at timestamptz,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_phone_calls_session_fk FOREIGN KEY (company_id, session_id)
    REFERENCES chat_voice_sessions(company_id, id) ON DELETE CASCADE,
  CONSTRAINT crm_phone_calls_identity_check CHECK (identity_state IN ('matched', 'unresolved', 'ambiguous', 'manual')),
  CONSTRAINT crm_phone_calls_report_check CHECK (report_status IN ('available', 'unavailable')),
  CONSTRAINT crm_phone_calls_phone_check CHECK (caller_phone_e164 IS NULL OR caller_phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);--> statement-breakpoint
CREATE UNIQUE INDEX crm_phone_calls_company_provider_uq ON crm_phone_calls (company_id, provider_session_id);--> statement-breakpoint
CREATE UNIQUE INDEX crm_phone_calls_company_session_uq ON crm_phone_calls (company_id, session_id);--> statement-breakpoint
CREATE INDEX crm_phone_calls_company_contact_idx ON crm_phone_calls (company_id, contact_id, started_at);--> statement-breakpoint
CREATE INDEX crm_phone_calls_company_started_idx ON crm_phone_calls (company_id, started_at);--> statement-breakpoint

CREATE TABLE crm_phone_callbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  source_call_id uuid REFERENCES crm_phone_calls(id) ON DELETE SET NULL,
  endpoint_id uuid NOT NULL,
  assignee_agent_id uuid NOT NULL REFERENCES agents(id),
  requested_by_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  requested_by_user_id text,
  requested_by_run_id uuid REFERENCES heartbeat_runs(id) ON DELETE SET NULL,
  phone_e164 text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  timezone text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  consent_basis text NOT NULL,
  gate_level text NOT NULL,
  approved_by_user_id text,
  approved_at timestamptz,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  dial_session_id uuid,
  provider_receipt_id text,
  dialed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_phone_callbacks_dial_session_fk FOREIGN KEY (company_id, dial_session_id)
    REFERENCES chat_voice_sessions(company_id, id),
  CONSTRAINT crm_phone_callbacks_status_check CHECK (status IN ('awaiting_consent', 'awaiting_approval', 'pending', 'dialed', 'cancelled')),
  CONSTRAINT crm_phone_callbacks_consent_check CHECK (consent_basis IN ('contact_consent_call', 'caller_requested_verified', 'missing')),
  CONSTRAINT crm_phone_callbacks_gate_check CHECK (gate_level IN ('draft_only', 'send_with_approval', 'send_direct')),
  CONSTRAINT crm_phone_callbacks_phone_check CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT crm_phone_callbacks_dialed_receipt_check CHECK (
    status <> 'dialed' OR (provider_receipt_id IS NOT NULL AND dial_session_id IS NOT NULL AND dialed_at IS NOT NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX crm_phone_callbacks_company_idempotency_uq ON crm_phone_callbacks (company_id, idempotency_key);--> statement-breakpoint
CREATE INDEX crm_phone_callbacks_company_status_due_idx ON crm_phone_callbacks (company_id, status, scheduled_for);--> statement-breakpoint
CREATE INDEX crm_phone_callbacks_company_contact_idx ON crm_phone_callbacks (company_id, contact_id);--> statement-breakpoint

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
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_links_company_idempotency_uq" ON "review_links" ("company_id", "idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_links_company_target_idx" ON "review_links" ("company_id", "target_kind", "target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_links_company_customer_idx" ON "review_links" ("company_id", "customer_id", "created_at");--> statement-breakpoint

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
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_link_events_link_key_uq" ON "review_link_events" ("link_id", "idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_link_events_link_idx" ON "review_link_events" ("link_id", "created_at");--> statement-breakpoint

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
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sync_configs_company_provider_uq" ON "crm_sync_configs" ("company_id", "provider");--> statement-breakpoint

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
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sync_links_local_uq" ON "crm_sync_links" ("company_id", "provider", "entity_kind", "local_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sync_links_external_uq" ON "crm_sync_links" ("company_id", "provider", "entity_kind", "external_id") WHERE "external_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_sync_links_status_idx" ON "crm_sync_links" ("company_id", "provider", "status");--> statement-breakpoint

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
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sync_jobs_company_idempotency_uq" ON "crm_sync_jobs" ("company_id", "idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_sync_jobs_company_provider_idx" ON "crm_sync_jobs" ("company_id", "provider", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_sync_jobs_status_idx" ON "crm_sync_jobs" ("status", "lease_expires_at");--> statement-breakpoint

-- Contact import receipts store only hashes and bounded results, never source CSV or inferred consent.
CREATE TABLE product_contact_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  csv_hash text NOT NULL,
  receipt jsonb NOT NULL,
  completed_at timestamptz NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX product_contact_imports_company_key_uq
  ON product_contact_imports (company_id, idempotency_key);

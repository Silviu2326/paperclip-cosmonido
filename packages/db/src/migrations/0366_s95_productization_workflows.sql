-- Manually consolidated additive schema changes after 0365. Source only; not executed.
-- Source fragment: 2026-10-22-s95-signup.sql
-- S95 durable account trial. Integration-owned migration fragment; do not apply independently.
ALTER TABLE product_accounts
  ADD COLUMN trial_started_at timestamptz,
  ADD COLUMN trial_expires_at timestamptz;

ALTER TABLE product_accounts
  ADD CONSTRAINT product_accounts_trial_window_check
  CHECK ((trial_started_at IS NULL AND trial_expires_at IS NULL)
      OR (trial_started_at IS NOT NULL AND trial_expires_at > trial_started_at));

-- One trial per verified account owner across billing accounts; service also locks auth_users for CAS ordering.
CREATE UNIQUE INDEX product_accounts_trial_owner_uidx
  ON product_accounts(owner_user_id)
  WHERE trial_started_at IS NOT NULL;
--> statement-breakpoint
-- Source fragment: 2026-10-22-s95-agency.sql
-- S95 agency fragment for root consolidation into the next manual migration.
-- Root owns migration numbering, journal edits, schema exports and snapshots.

CREATE TABLE productization_agency_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES product_accounts(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  -- Chosen before companyService.create so retries keep one identity. No FK by design:
  -- a durable operation can precede the canonical factory's company insert.
  company_id uuid NOT NULL,
  company_name text NOT NULL,
  company_description text NOT NULL DEFAULT '',
  source_content_hash text NOT NULL,
  source_company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  source_package_id uuid NOT NULL REFERENCES productization_portable_packages(id) ON DELETE RESTRICT,
  target_package_id uuid REFERENCES productization_portable_packages(id) ON DELETE SET NULL,
  requested_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','creating','awaiting_capacity','package_ready','ready','uncertain')),
  lease_id uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_agency_operations_account_key_uq UNIQUE (account_id, idempotency_key),
  CONSTRAINT productization_agency_operations_company_uq UNIQUE (account_id, company_id)
);
CREATE INDEX productization_agency_operations_status_lease_idx
  ON productization_agency_operations(status, lease_expires_at);

CREATE TABLE productization_agency_brands (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  public_enabled boolean NOT NULL DEFAULT false,
  display_name text NOT NULL,
  primary_color text NOT NULL CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text NOT NULL CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  requested_domain text,
  domain_status text NOT NULL DEFAULT 'unavailable' CHECK (domain_status = 'unavailable'),
  updated_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Source fragment: 2026-10-22-s95-conversation.sql
CREATE TABLE conversation_agent_dispatch_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  agent_id uuid NOT NULL,
  responsible_user_id text NOT NULL,
  created_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_agent_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_message_id uuid NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  responsible_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  wakeup_request_id uuid REFERENCES agent_wakeup_requests(id) ON DELETE SET NULL,
  language text,
  language_source text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_agent_dispatches_status_check
    CHECK (status IN ('pending', 'leased', 'wake_queued', 'skipped', 'failed')),
  CONSTRAINT conversation_agent_dispatches_attempts_check CHECK (attempts >= 0),
  CONSTRAINT conversation_agent_dispatches_language_source_check
    CHECK (language_source IS NULL OR language_source IN ('contact', 'conversation')),
  CONSTRAINT conversation_agent_dispatches_lease_check CHECK (
    (status = 'leased' AND lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR status <> 'leased'
  )
);

CREATE UNIQUE INDEX conversation_agent_dispatches_company_source_uq
  ON conversation_agent_dispatches(company_id, source_message_id);
CREATE INDEX conversation_agent_dispatches_pending_idx
  ON conversation_agent_dispatches(status, next_attempt_at, lease_expires_at, created_at);
CREATE INDEX conversation_agent_dispatches_conversation_idx
  ON conversation_agent_dispatches(company_id, conversation_id, created_at);
--> statement-breakpoint
-- Source fragment: 2026-10-22-s95-public-catalog.sql
-- S95 fragment for root consolidation into the next manual migration.
-- Root owns migration numbering, journal edits, schema snapshots, and exports.

CREATE TABLE productization_public_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_package_id uuid NOT NULL REFERENCES productization_portable_packages(id) ON DELETE RESTRICT,
  source_company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  package_key text NOT NULL,
  package_version text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  selection jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected','withdrawn')),
  requested_by_user_id text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by_user_id text,
  reviewed_at timestamptz,
  review_note text,
  privacy_attested_at timestamptz NOT NULL,
  published_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_public_catalog_source_version_uq UNIQUE (source_package_id, content_hash)
);
CREATE INDEX productization_public_catalog_status_created_idx ON productization_public_catalog(status, created_at);

CREATE TABLE productization_public_catalog_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES productization_public_catalog(id) ON DELETE RESTRICT,
  package_id uuid NOT NULL UNIQUE REFERENCES productization_portable_packages(id) ON DELETE RESTRICT,
  source_company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  target_company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  imported_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX productization_public_catalog_import_listing_idx ON productization_public_catalog_imports(listing_id, target_company_id);

CREATE TABLE productization_public_catalog_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES productization_public_catalog(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL REFERENCES productization_package_installations(id) ON DELETE RESTRICT,
  user_id text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review text,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  moderated_by_user_id text,
  moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_public_catalog_rating_principal_uq UNIQUE (listing_id, user_id)
);
CREATE INDEX productization_public_catalog_rating_receipt_idx ON productization_public_catalog_ratings(listing_id, installation_id);
--> statement-breakpoint
-- Source fragment: 2026-10-22-s95-voice.sql
-- S95 CRM callback execution delta on top of doc/plans/2026-10-22-s90-phone.sql.
-- Consolidate with the shared manual migration; do not execute this fragment directly.

ALTER TABLE chat_voice_sessions
  DROP CONSTRAINT IF EXISTS chat_voice_sessions_authority_check;
ALTER TABLE chat_voice_sessions
  ADD CONSTRAINT chat_voice_sessions_authority_check
  CHECK (caller_authority IN ('member', 'instance_admin', 'local_board', 'guest_intake', 'pending_approval', 'crm_callback'));

ALTER TABLE crm_phone_callbacks
  ADD COLUMN revision integer NOT NULL DEFAULT 1,
  ADD COLUMN approved_revision integer,
  ADD COLUMN claim_token text,
  ADD COLUMN claim_expires_at timestamptz,
  ADD COLUMN dial_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN network_started_at timestamptz,
  ADD COLUMN next_attempt_at timestamptz,
  ADD COLUMN last_error_code text,
  ADD COLUMN last_blockers jsonb,
  ADD COLUMN last_evaluated_at timestamptz;

ALTER TABLE crm_phone_callbacks
  DROP CONSTRAINT IF EXISTS crm_phone_callbacks_status_check,
  DROP CONSTRAINT IF EXISTS crm_phone_callbacks_revision_check,
  DROP CONSTRAINT IF EXISTS crm_phone_callbacks_lease_check;
ALTER TABLE crm_phone_callbacks
  ADD CONSTRAINT crm_phone_callbacks_status_check CHECK (status IN (
    'awaiting_consent', 'awaiting_approval', 'pending', 'dialing', 'dialed',
    'dial_unknown', 'failed', 'missed', 'cancelled'
  )),
  ADD CONSTRAINT crm_phone_callbacks_revision_check CHECK (
    revision >= 1 AND (approved_revision IS NULL OR approved_revision BETWEEN 1 AND revision) AND dial_attempts >= 0
  ),
  ADD CONSTRAINT crm_phone_callbacks_lease_check CHECK (
    (status = 'dialing') = (claim_token IS NOT NULL AND claim_expires_at IS NOT NULL)
  );

-- S90's former public receipt route could link a same-endpoint member call. Keep that history,
-- but do not assert it was a CRM contact dial unless the exact callback principal is persisted.
UPDATE crm_phone_callbacks callback
SET status = 'dial_unknown',
    network_started_at = COALESCE(callback.network_started_at, callback.dialed_at),
    last_error_code = 'legacy_receipt_not_callback_bound',
    last_blockers = '["unknown_outcome","legacy_receipt_not_callback_bound"]'::jsonb,
    last_evaluated_at = now(),
    updated_at = now()
WHERE callback.status = 'dialed'
  AND NOT EXISTS (
    SELECT 1 FROM chat_voice_sessions session
    WHERE session.company_id = callback.company_id
      AND session.id = callback.dial_session_id
      AND session.caller_id = 'crm_callback:' || callback.id::text
      AND session.caller_authority = 'crm_callback'
      AND session.mode = 'outbound_phone'
      AND session.provider_session_id = callback.provider_receipt_id
      AND session.endpoint_id = callback.endpoint_id
      AND session.issue_id = callback.issue_id
      AND session.assigned_agent_id = callback.assignee_agent_id
  );

CREATE INDEX IF NOT EXISTS crm_phone_callbacks_status_due_idx
  ON crm_phone_callbacks (status, scheduled_for);
CREATE INDEX IF NOT EXISTS crm_phone_callbacks_lease_idx
  ON crm_phone_callbacks (status, claim_expires_at);
--> statement-breakpoint
-- Source fragment: 2026-10-22-s95-portal.sql
-- Additive portal file transport; root consolidates into 0366. Not executed.
ALTER TABLE customer_portals ADD COLUMN IF NOT EXISTS allow_file_uploads boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE customer_portal_files (
 id uuid PRIMARY KEY,
 company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
 portal_id uuid REFERENCES customer_portals(id) ON DELETE CASCADE,
 direction text NOT NULL, state text NOT NULL DEFAULT 'pending',
 visible_to_customer boolean NOT NULL DEFAULT true,
 asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
 object_key text NOT NULL, original_filename text NOT NULL,
 content_type text NOT NULL, byte_size bigint NOT NULL, sha256 text NOT NULL,
 idempotency_key uuid, created_by_user_id text,
 hidden_at timestamptz, stored_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT customer_portal_files_direction_check CHECK (direction IN ('inbound','outbound')),
 CONSTRAINT customer_portal_files_state_check CHECK (state IN ('pending','stored','rejected','abandoned')),
 CONSTRAINT customer_portal_files_inbound_check CHECK (direction <> 'inbound' OR (portal_id IS NOT NULL AND idempotency_key IS NOT NULL)),
 CONSTRAINT customer_portal_files_size_check CHECK (byte_size > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX customer_portal_files_portal_key_uq ON customer_portal_files(portal_id,idempotency_key);
--> statement-breakpoint
CREATE UNIQUE INDEX customer_portal_files_object_key_uq ON customer_portal_files(company_id,object_key);
--> statement-breakpoint
CREATE INDEX customer_portal_files_customer_idx ON customer_portal_files(company_id,customer_id,created_at);
--> statement-breakpoint
CREATE INDEX customer_portal_files_portal_state_idx ON customer_portal_files(portal_id,state);
--> statement-breakpoint
-- Source fragment: 2026-10-22-s95-privacy.sql
-- S95 privacy additive fragment. Integrate into the consolidated journal; do not execute alone.
ALTER TABLE company_files
  ADD COLUMN retention_purge_started_at timestamptz,
  ADD COLUMN retention_purged_at timestamptz,
  ADD CONSTRAINT company_files_retention_purge_state_check
    CHECK (retention_purged_at IS NULL OR retention_purge_started_at IS NOT NULL);

ALTER TABLE productization_company_retention
  ADD COLUMN conversations_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN conversations_days integer NOT NULL DEFAULT 365,
  ADD COLUMN files_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN files_days integer NOT NULL DEFAULT 30,
  ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE productization_company_retention
  ADD CONSTRAINT productization_company_retention_conv_days_check CHECK (conversations_days BETWEEN 30 AND 3650),
  ADD CONSTRAINT productization_company_retention_files_days_check CHECK (files_days BETWEEN 7 AND 3650),
  ADD CONSTRAINT productization_company_retention_revision_check CHECK (revision >= 0);

CREATE TABLE productization_retention_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  input_hash text NOT NULL,
  counts jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX productization_retention_previews_company_idx ON productization_retention_previews(company_id, created_at);

CREATE TABLE productization_retention_sweeps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_revision integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  phase text NOT NULL DEFAULT 'conversations',
  conversations_cutoff timestamptz,
  files_cutoff timestamptz,
  conversations_cursor uuid,
  files_cursor uuid,
  conversations_redacted integer NOT NULL DEFAULT 0,
  messages_redacted integer NOT NULL DEFAULT 0,
  files_purged integer NOT NULL DEFAULT 0,
  versions_purged integer NOT NULL DEFAULT 0,
  bytes_purged bigint NOT NULL DEFAULT 0,
  protected_skipped integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_retention_sweeps_status_check CHECK (status IN ('pending','running','completed','failed','superseded')),
  CONSTRAINT productization_retention_sweeps_phase_check CHECK (phase IN ('conversations','files','done'))
);
CREATE UNIQUE INDEX productization_retention_sweeps_active_uq ON productization_retention_sweeps(company_id) WHERE status IN ('pending','running');
CREATE INDEX productization_retention_sweeps_claim_idx ON productization_retention_sweeps(status, lease_expires_at);
CREATE INDEX productization_retention_sweeps_company_idx ON productization_retention_sweeps(company_id, created_at);

CREATE TABLE productization_retention_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sweep_id uuid REFERENCES productization_retention_sweeps(id) ON DELETE SET NULL,
  kind text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_retention_events_kind_check CHECK (kind IN ('policy_updated','sweep_started','sweep_batch','sweep_completed','sweep_failed','sweep_superseded')),
  CONSTRAINT productization_retention_events_actor_check CHECK (actor_type IN ('user','system'))
);
CREATE INDEX productization_retention_events_company_idx ON productization_retention_events(company_id, created_at);

CREATE TABLE productization_account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES product_accounts(id) ON DELETE RESTRICT,
  requested_by_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'cooling',
  step text NOT NULL DEFAULT 'verify',
  cooling_ends_at timestamptz NOT NULL,
  scope jsonb NOT NULL,
  blocker_code text,
  blocker_detail jsonb,
  irreversible_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_user_id text,
  completed_at timestamptz,
  counters jsonb NOT NULL DEFAULT '{}',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_account_deletions_status_check CHECK (status IN ('cooling','running','blocked','completed','cancelled')),
  CONSTRAINT productization_account_deletions_step_check CHECK (step IN ('verify','usage','anonymize','done'))
);
CREATE UNIQUE INDEX productization_account_deletions_open_uq ON productization_account_deletions(account_id) WHERE status IN ('cooling','running','blocked');
CREATE INDEX productization_account_deletions_due_idx ON productization_account_deletions(status, cooling_ends_at);
--> statement-breakpoint
-- Source fragment: 2026-10-22-s95-copilot.sql
-- Durable provider invocation/idempotency ledger; uncertain calls are never blindly repeated.
CREATE TABLE productization_copilot_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  request jsonb NOT NULL,
  response jsonb,
  result jsonb,
  invocation_id uuid REFERENCES decision_invocations(id) ON DELETE SET NULL,
  provider text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT productization_copilot_requests_status_check CHECK (status IN ('pending', 'responded', 'completed', 'unknown')),
  CONSTRAINT productization_copilot_requests_hash_check CHECK (length(request_hash) = 64)
);
CREATE UNIQUE INDEX productization_copilot_requests_key_idx
  ON productization_copilot_requests(company_id, feature, idempotency_key);
CREATE INDEX productization_copilot_requests_invocation_idx
  ON productization_copilot_requests(company_id, invocation_id);

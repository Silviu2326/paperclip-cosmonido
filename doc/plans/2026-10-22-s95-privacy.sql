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

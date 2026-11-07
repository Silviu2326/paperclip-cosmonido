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
);
CREATE UNIQUE INDEX crm_phone_calls_company_provider_uq ON crm_phone_calls (company_id, provider_session_id);
CREATE UNIQUE INDEX crm_phone_calls_company_session_uq ON crm_phone_calls (company_id, session_id);
CREATE INDEX crm_phone_calls_company_contact_idx ON crm_phone_calls (company_id, contact_id, started_at);
CREATE INDEX crm_phone_calls_company_started_idx ON crm_phone_calls (company_id, started_at);

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
);
CREATE UNIQUE INDEX crm_phone_callbacks_company_idempotency_uq ON crm_phone_callbacks (company_id, idempotency_key);
CREATE INDEX crm_phone_callbacks_company_status_due_idx ON crm_phone_callbacks (company_id, status, scheduled_for);
CREATE INDEX crm_phone_callbacks_company_contact_idx ON crm_phone_callbacks (company_id, contact_id);

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

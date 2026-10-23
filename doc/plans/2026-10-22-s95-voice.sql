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

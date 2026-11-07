-- Source schema fragment for the S3 renewal handoff. Migration generation/execution
-- is intentionally left to the owning integration branch.
ALTER TABLE agreement_periods
  ADD COLUMN renewal_task_id uuid REFERENCES goals(id) ON DELETE SET NULL;

ALTER TABLE daily_brief_preferences
  ADD COLUMN delivery_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;

ALTER TABLE daily_brief_preferences
  ADD COLUMN pending_task_id uuid REFERENCES goals(id) ON DELETE SET NULL;

-- `status` is text without a check constraint; the new saga state is
-- `renewal_requested_pending_run`.

CREATE TABLE commercial_automation_cursors (
  lane text PRIMARY KEY,
  last_source_id uuid,
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

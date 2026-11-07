-- Source fragment only. Root owns the consolidated migration.
ALTER TABLE booking_types
  ADD COLUMN IF NOT EXISTS public_execution_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delegated_by_user_id text,
  ADD COLUMN IF NOT EXISTS delegated_at timestamptz;

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
  );

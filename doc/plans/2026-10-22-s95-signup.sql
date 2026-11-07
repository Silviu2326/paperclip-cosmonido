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

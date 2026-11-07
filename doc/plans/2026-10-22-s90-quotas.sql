-- Durable 80% / 100% account-level quota notices.
-- The Drizzle schema is packages/db/src/schema/productization_accounts.ts;
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
);

CREATE UNIQUE INDEX product_account_usage_notifications_dedupe_uidx
  ON product_account_usage_notifications (account_id, metric, period_key, threshold);
CREATE INDEX product_account_usage_notifications_recent_idx
  ON product_account_usage_notifications (account_id, created_at);

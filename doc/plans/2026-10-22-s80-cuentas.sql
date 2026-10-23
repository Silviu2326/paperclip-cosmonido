-- Proposed additive fragment for the consolidated migration 0364. No plan or price is seeded.
CREATE TABLE product_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  name text NOT NULL, plan_id text NOT NULL, access text NOT NULL DEFAULT 'inactive' CHECK (access IN ('active','trial_eligible','inactive')),
  stripe_customer_id text UNIQUE, stripe_subscription_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_account_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES product_accounts(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, role text NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id,user_id)
);
CREATE TABLE product_account_company_grants (
  account_id uuid NOT NULL REFERENCES product_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  granted_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,company_id)
);
CREATE TABLE product_plans (
  id text PRIMARY KEY, name text NOT NULL, limits jsonb NOT NULL, stripe_price_id text, enabled integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_usage_meters (
  account_id uuid NOT NULL REFERENCES product_accounts(id) ON DELETE CASCADE, metric text NOT NULL, period_key text NOT NULL,
  consumed numeric(24,7) NOT NULL DEFAULT 0 CHECK (consumed >= 0), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_id,metric,period_key)
);
CREATE TABLE product_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES product_accounts(id) ON DELETE CASCADE,
  metric text NOT NULL, period_key text NOT NULL, idempotency_key text NOT NULL, quantity numeric(24,7) NOT NULL CHECK (quantity > 0), source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id,idempotency_key)
);
CREATE TABLE product_billing_events (
  event_id text PRIMARY KEY, event_type text NOT NULL, processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_account_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid REFERENCES product_accounts(id) ON DELETE CASCADE,
  actor_id text NOT NULL, actor_type text NOT NULL DEFAULT 'user', action text NOT NULL, entity_type text NOT NULL,
  entity_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_usage_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES product_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE, metric text NOT NULL, period_key text NOT NULL,
  idempotency_key text NOT NULL, request_fingerprint text NOT NULL, quantity numeric(24,7) NOT NULL CHECK (quantity > 0),
  state text NOT NULL CHECK (state IN ('reserved','committed','uncertain','released')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,idempotency_key)
);

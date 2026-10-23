-- Proposed fragment for the consolidated migration 0364. Do not execute here.
CREATE TABLE product_public_api_keys (
  board_api_key_id uuid PRIMARY KEY REFERENCES board_api_keys(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  scopes jsonb NOT NULL CHECK (jsonb_typeof(scopes) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_public_api_keys_company_idx ON product_public_api_keys(company_id);

CREATE TABLE business_webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, url text NOT NULL,
  events jsonb NOT NULL CHECK (jsonb_typeof(events) = 'array'), secret_material text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','revoked')),
  last_delivery_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_webhook_subscriptions_company_idx ON business_webhook_subscriptions(company_id,status);

-- event_id is the source activity UUID, making activity retries idempotent.
CREATE TABLE business_webhook_outbox (
  event_id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('lead.created','proposal.accepted','deliverable.accepted','conversation.created')),
  occurred_at timestamptz NOT NULL, data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'), fanned_out_at timestamptz
);
CREATE INDEX business_webhook_outbox_fanout_idx ON business_webhook_outbox(fanned_out_at,occurred_at);

CREATE TABLE business_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES business_webhook_outbox(event_id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES business_webhook_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivering','delivered','blocked')),
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz,
  delivered_at timestamptz, last_http_status integer, last_error text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,subscription_id)
);
CREATE INDEX business_webhook_deliveries_due_idx ON business_webhook_deliveries(status,next_attempt_at,locked_until);

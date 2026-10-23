CREATE TABLE product_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  categories jsonb NOT NULL DEFAULT '["decisions", "reviews", "tasks"]'::jsonb,
  browser_enabled boolean NOT NULL DEFAULT false,
  remote_push_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_notification_preferences_company_user_uq UNIQUE (company_id, user_id),
  CONSTRAINT product_notification_preferences_category_scope_check CHECK (
    categories <@ '["decisions", "reviews", "tasks"]'::jsonb
  )
);
CREATE INDEX product_notification_preferences_company_idx ON product_notification_preferences(company_id);

CREATE TABLE product_notification_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  endpoint_hash text NOT NULL,
  endpoint_host text NOT NULL,
  encrypted_material text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_notification_subscriptions_owner_endpoint_uq UNIQUE (company_id, user_id, endpoint_hash)
);
CREATE INDEX product_notification_subscriptions_active_company_idx ON product_notification_subscriptions(company_id, status);
CREATE INDEX product_notification_subscriptions_user_idx ON product_notification_subscriptions(user_id, status);

CREATE TABLE product_notification_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES activity_log(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_notification_signals_activity_uq UNIQUE (company_id, activity_id)
);
CREATE INDEX product_notification_signals_queue_idx ON product_notification_signals(status, next_attempt_at);

CREATE TABLE product_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  subscription_id uuid NOT NULL REFERENCES product_notification_subscriptions(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('decisions', 'reviews', 'tasks')),
  source_type text NOT NULL,
  source_id text NOT NULL,
  revision text NOT NULL,
  href text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'dead', 'expired')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  expires_at timestamptz NOT NULL,
  sent_at timestamptz,
  last_status_code integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_notification_outbox_source_revision_uq UNIQUE (subscription_id, source_type, source_id, revision)
);
CREATE INDEX product_notification_outbox_queue_idx ON product_notification_outbox(status, next_attempt_at);
CREATE INDEX product_notification_outbox_company_user_idx ON product_notification_outbox(company_id, user_id, created_at);

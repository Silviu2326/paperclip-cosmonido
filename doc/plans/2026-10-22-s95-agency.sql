-- S95 agency fragment for root consolidation into the next manual migration.
-- Root owns migration numbering, journal edits, schema exports and snapshots.

CREATE TABLE productization_agency_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES product_accounts(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  -- Chosen before companyService.create so retries keep one identity. No FK by design:
  -- a durable operation can precede the canonical factory's company insert.
  company_id uuid NOT NULL,
  company_name text NOT NULL,
  company_description text NOT NULL DEFAULT '',
  source_content_hash text NOT NULL,
  source_company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  source_package_id uuid NOT NULL REFERENCES productization_portable_packages(id) ON DELETE RESTRICT,
  target_package_id uuid REFERENCES productization_portable_packages(id) ON DELETE SET NULL,
  requested_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','creating','awaiting_capacity','package_ready','ready','uncertain')),
  lease_id uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_agency_operations_account_key_uq UNIQUE (account_id, idempotency_key),
  CONSTRAINT productization_agency_operations_company_uq UNIQUE (account_id, company_id)
);
CREATE INDEX productization_agency_operations_status_lease_idx
  ON productization_agency_operations(status, lease_expires_at);

CREATE TABLE productization_agency_brands (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  public_enabled boolean NOT NULL DEFAULT false,
  display_name text NOT NULL,
  primary_color text NOT NULL CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text NOT NULL CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  requested_domain text,
  domain_status text NOT NULL DEFAULT 'unavailable' CHECK (domain_status = 'unavailable'),
  updated_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- S4 E (catálogo portátil e instalación). Fragmento aditivo; el integrador lo consolida en la migración 0364.
-- No toca tablas existentes. Orden: paquetes → recibos → ítems.

CREATE TABLE productization_portable_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  package_key text NOT NULL,
  package_version text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  name text NOT NULL,
  description text NOT NULL,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  privacy_attested_at timestamptz,
  created_by_user_id text,
  review_requested_at timestamptz,
  reviewed_by_user_id text,
  reviewed_at timestamptz,
  published_by_user_id text,
  published_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_portable_packages_status_check
    CHECK (status in ('draft','in_review','published','withdrawn'))
);
CREATE UNIQUE INDEX productization_portable_packages_company_key_version_uq
  ON productization_portable_packages(company_id, package_key, package_version);
CREATE INDEX productization_portable_packages_company_status_idx
  ON productization_portable_packages(company_id, status, updated_at);

CREATE TABLE productization_package_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES productization_portable_packages(id) ON DELETE RESTRICT,
  package_key text NOT NULL,
  package_version text NOT NULL,
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  plan jsonb NOT NULL,
  created_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT productization_package_installations_status_check
    CHECK (status in ('planned','in_progress','completed','needs_attention','cancelled'))
);
CREATE UNIQUE INDEX productization_package_installations_company_package_uq
  ON productization_package_installations(company_id, package_id);
CREATE INDEX productization_package_installations_company_status_idx
  ON productization_package_installations(company_id, status);

CREATE TABLE productization_package_installation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES productization_package_installations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  local_key text NOT NULL,
  kind text NOT NULL DEFAULT 'persistent_agent',
  status text NOT NULL DEFAULT 'planned',
  review jsonb NOT NULL,
  -- Correlation id (agent metadata + hire Idempotency-Key). Never rotated; no release path exists.
  -- planned = never claimed (cancellable); submitting/unknown = claimed, blocked until reconciled;
  -- cancelled = only from planned; blocked = reserved, not written today.
  hire_attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  approval_id uuid REFERENCES approvals(id) ON DELETE SET NULL,
  claimed_by_user_id text,
  claimed_at timestamptz,
  resolved_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_package_installation_items_status_check
    CHECK (status in ('planned','submitting','pending_approval','hired','unknown','blocked','cancelled'))
);
CREATE UNIQUE INDEX productization_package_installation_items_key_uq
  ON productization_package_installation_items(installation_id, local_key);
CREATE UNIQUE INDEX productization_package_installation_items_attempt_uq
  ON productization_package_installation_items(hire_attempt_id);
CREATE UNIQUE INDEX productization_package_installation_items_agent_uq
  ON productization_package_installation_items(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX productization_package_installation_items_company_status_idx
  ON productization_package_installation_items(company_id, status);

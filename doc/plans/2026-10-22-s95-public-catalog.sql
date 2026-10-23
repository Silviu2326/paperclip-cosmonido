-- S95 fragment for root consolidation into the next manual migration.
-- Root owns migration numbering, journal edits, schema snapshots, and exports.

CREATE TABLE productization_public_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_package_id uuid NOT NULL REFERENCES productization_portable_packages(id) ON DELETE RESTRICT,
  source_company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  package_key text NOT NULL,
  package_version text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  selection jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected','withdrawn')),
  requested_by_user_id text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by_user_id text,
  reviewed_at timestamptz,
  review_note text,
  privacy_attested_at timestamptz NOT NULL,
  published_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_public_catalog_source_version_uq UNIQUE (source_package_id, content_hash)
);
CREATE INDEX productization_public_catalog_status_created_idx ON productization_public_catalog(status, created_at);

CREATE TABLE productization_public_catalog_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES productization_public_catalog(id) ON DELETE RESTRICT,
  package_id uuid NOT NULL UNIQUE REFERENCES productization_portable_packages(id) ON DELETE RESTRICT,
  source_company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  target_company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  imported_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX productization_public_catalog_import_listing_idx ON productization_public_catalog_imports(listing_id, target_company_id);

CREATE TABLE productization_public_catalog_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES productization_public_catalog(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL REFERENCES productization_package_installations(id) ON DELETE RESTRICT,
  user_id text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review text,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  moderated_by_user_id text,
  moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_public_catalog_rating_principal_uq UNIQUE (listing_id, user_id)
);
CREATE INDEX productization_public_catalog_rating_receipt_idx ON productization_public_catalog_ratings(listing_id, installation_id);

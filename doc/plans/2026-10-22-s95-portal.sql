-- Additive portal file transport; root consolidates into 0366. Not executed.
ALTER TABLE customer_portals ADD COLUMN IF NOT EXISTS allow_file_uploads boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE customer_portal_files (
 id uuid PRIMARY KEY,
 company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
 portal_id uuid REFERENCES customer_portals(id) ON DELETE CASCADE,
 direction text NOT NULL, state text NOT NULL DEFAULT 'pending',
 visible_to_customer boolean NOT NULL DEFAULT true,
 asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
 object_key text NOT NULL, original_filename text NOT NULL,
 content_type text NOT NULL, byte_size bigint NOT NULL, sha256 text NOT NULL,
 idempotency_key uuid, created_by_user_id text,
 hidden_at timestamptz, stored_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT customer_portal_files_direction_check CHECK (direction IN ('inbound','outbound')),
 CONSTRAINT customer_portal_files_state_check CHECK (state IN ('pending','stored','rejected','abandoned')),
 CONSTRAINT customer_portal_files_inbound_check CHECK (direction <> 'inbound' OR (portal_id IS NOT NULL AND idempotency_key IS NOT NULL)),
 CONSTRAINT customer_portal_files_size_check CHECK (byte_size > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX customer_portal_files_portal_key_uq ON customer_portal_files(portal_id,idempotency_key);
--> statement-breakpoint
CREATE UNIQUE INDEX customer_portal_files_object_key_uq ON customer_portal_files(company_id,object_key);
--> statement-breakpoint
CREATE INDEX customer_portal_files_customer_idx ON customer_portal_files(company_id,customer_id,created_at);
--> statement-breakpoint
CREATE INDEX customer_portal_files_portal_state_idx ON customer_portal_files(portal_id,state);

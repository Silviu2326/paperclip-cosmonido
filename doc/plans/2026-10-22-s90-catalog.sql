-- S90 catálogo: instalación de recursos de paquete (playbooks, formularios, presets de marca, plantillas de encargo).
-- Fragmento aditivo para que el integrador lo consolide en una migración NUEVA (0364 ya contiene las tres tablas del
-- catálogo; no se edita). No se tocó journal, snapshots ni migraciones. Nada de esto se ha ejecutado.
-- Orden: ítems (columnas, índices, checks) → tablas de borradores.

-- 1) Recibo por recurso: tipo, identidad de dominio, huella de la fuente, enlace al registro creado y resultado.
ALTER TABLE productization_package_installation_items
  ADD COLUMN domain_identity text,
  ADD COLUMN source_content_hash text,
  ADD COLUMN resource_id uuid,
  ADD COLUMN result jsonb;

-- Identidad única por empresa y tipo: dos recibos no pueden reservar la misma clave/slug.
CREATE UNIQUE INDEX productization_package_installation_items_identity_uq
  ON productization_package_installation_items(company_id, kind, domain_identity)
  WHERE domain_identity IS NOT NULL;
-- Un registro de dominio solo puede estar enlazado por un ítem (resource_id es polimórfico por kind: sin FK).
CREATE UNIQUE INDEX productization_package_installation_items_resource_uq
  ON productization_package_installation_items(kind, resource_id)
  WHERE resource_id IS NOT NULL;

ALTER TABLE productization_package_installation_items
  ADD CONSTRAINT productization_package_installation_items_kind_check
  CHECK (kind in ('persistent_agent','playbook','lead_form','brand_preset','request_template'));

-- Estados nuevos de recurso: creating (reclamado, reanudable), created (enlazado), conflict (identidad ocupada por otra cosa).
ALTER TABLE productization_package_installation_items
  DROP CONSTRAINT productization_package_installation_items_status_check;
ALTER TABLE productization_package_installation_items
  ADD CONSTRAINT productization_package_installation_items_status_check
  CHECK (status in ('planned','submitting','pending_approval','hired','unknown','blocked','cancelled','creating','created','conflict'));

-- 2) Presets de marca instalados desde paquetes (borrador inerte).
CREATE TABLE productization_brand_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  preset_key text NOT NULL,
  name text NOT NULL,
  voice text NOT NULL,
  audience text NOT NULL,
  preferred_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  avoided_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_color text,
  accent_color text,
  status text NOT NULL DEFAULT 'draft',
  source_package_key text NOT NULL,
  source_package_version text NOT NULL,
  source_local_id text NOT NULL,
  source_content_hash text NOT NULL,
  -- Ítem del recibo que lo creó; id simple (sin FK) para que descartar un recibo nunca borre el registro.
  source_item_id uuid NOT NULL,
  created_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_brand_presets_status_check CHECK (status in ('draft','active','archived'))
);
CREATE UNIQUE INDEX productization_brand_presets_company_key_uq
  ON productization_brand_presets(company_id, preset_key);
CREATE UNIQUE INDEX productization_brand_presets_provenance_uq
  ON productization_brand_presets(company_id, source_package_key, source_package_version, source_local_id);
CREATE UNIQUE INDEX productization_brand_presets_source_item_uq
  ON productization_brand_presets(source_item_id);
CREATE INDEX productization_brand_presets_company_status_idx
  ON productization_brand_presets(company_id, status);

-- 3) Plantillas de encargo instaladas desde paquetes (borrador; no crean encargos ni inician playbooks).
CREATE TABLE productization_request_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  name text NOT NULL,
  outcome text NOT NULL,
  acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_deliverable text NOT NULL,
  suggested_playbooks jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  source_package_key text NOT NULL,
  source_package_version text NOT NULL,
  source_local_id text NOT NULL,
  source_content_hash text NOT NULL,
  source_item_id uuid NOT NULL,
  created_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productization_request_templates_status_check CHECK (status in ('draft','active','archived'))
);
CREATE UNIQUE INDEX productization_request_templates_company_key_uq
  ON productization_request_templates(company_id, template_key);
CREATE UNIQUE INDEX productization_request_templates_provenance_uq
  ON productization_request_templates(company_id, source_package_key, source_package_version, source_local_id);
CREATE UNIQUE INDEX productization_request_templates_source_item_uq
  ON productization_request_templates(source_item_id);
CREATE INDEX productization_request_templates_company_status_idx
  ON productization_request_templates(company_id, status);

-- 4) Procedencia durable en playbooks y formularios instalados. Null para filas no provenientes del catálogo.
ALTER TABLE playbooks
  ADD COLUMN installation_item_id uuid,
  ADD COLUMN installation_source_content_hash text;
CREATE UNIQUE INDEX playbooks_installation_item_uq
  ON playbooks(installation_item_id)
  WHERE installation_item_id IS NOT NULL;

ALTER TABLE lead_forms
  ADD COLUMN installation_item_id uuid,
  ADD COLUMN installation_source_content_hash text;
CREATE UNIQUE INDEX lead_forms_installation_item_uq
  ON lead_forms(installation_item_id)
  WHERE installation_item_id IS NOT NULL;

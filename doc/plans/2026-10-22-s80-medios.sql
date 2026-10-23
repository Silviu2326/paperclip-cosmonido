CREATE TABLE productization_media_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  preset_key text NOT NULL,
  version integer NOT NULL,
  kind text NOT NULL,
  output_aspect text NOT NULL DEFAULT '9:16',
  name text NOT NULL,
  description text,
  input_criteria jsonb NOT NULL,
  operations jsonb NOT NULL,
  brand_references jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX productization_media_presets_company_key_version_uq
  ON productization_media_presets(company_id, preset_key, version);
CREATE INDEX productization_media_presets_company_kind_idx
  ON productization_media_presets(company_id, kind, created_at);
ALTER TABLE productization_media_presets
  ADD CONSTRAINT productization_media_presets_kind_check CHECK (kind IN ('clip', 'demo', 'testimonial', 'tutorial', 'advert')),
  ADD CONSTRAINT productization_media_presets_aspect_check CHECK (output_aspect IN ('9:16', '16:9'));

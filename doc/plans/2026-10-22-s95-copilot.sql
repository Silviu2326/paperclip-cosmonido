-- Incremental schema fragment for 0366. Do not execute independently.
CREATE TABLE productization_copilot_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  request jsonb NOT NULL,
  response jsonb,
  result jsonb,
  invocation_id uuid REFERENCES decision_invocations(id) ON DELETE SET NULL,
  provider text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT productization_copilot_requests_status_check CHECK (status IN ('pending', 'responded', 'completed', 'unknown')),
  CONSTRAINT productization_copilot_requests_hash_check CHECK (length(request_hash) = 64)
);
CREATE UNIQUE INDEX productization_copilot_requests_key_idx
  ON productization_copilot_requests(company_id, feature, idempotency_key);
CREATE INDEX productization_copilot_requests_invocation_idx
  ON productization_copilot_requests(company_id, invocation_id);

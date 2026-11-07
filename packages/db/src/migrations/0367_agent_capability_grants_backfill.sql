-- Existing agents keep what they can do today: grant the three capability
-- permissions (messages, calls, video) to every non-terminated agent that lacks
-- them. Idempotent: rows that already exist are skipped.
INSERT INTO "principal_permission_grants" (
  "company_id",
  "principal_type",
  "principal_id",
  "permission_key",
  "scope",
  "granted_by_user_id",
  "created_at",
  "updated_at"
)
SELECT
  a."company_id",
  'agent',
  a."id"::text,
  k."permission_key",
  NULL,
  NULL,
  now(),
  now()
FROM "agents" AS a
CROSS JOIN (
  VALUES ('channels:message'), ('channels:call'), ('media:generate')
) AS k("permission_key")
WHERE a."status" <> 'terminated'
  AND NOT EXISTS (
    SELECT 1
    FROM "principal_permission_grants" AS g
    WHERE g."company_id" = a."company_id"
      AND g."principal_type" = 'agent'
      AND g."principal_id" = a."id"::text
      AND g."permission_key" = k."permission_key"
  )
ON CONFLICT (
  "company_id",
  "principal_type",
  "principal_id",
  "permission_key"
) DO NOTHING;

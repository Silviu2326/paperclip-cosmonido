-- S80 lead forms: schema fragment for the parent integration.
-- NOT a migration and NOT a journal entry. The parent adds the matching Drizzle columns
-- in packages/db/src/schema/lead_forms.ts, runs `pnpm db:generate` once, and reviews the
-- generated file. Idempotent: safe to re-run on a database where it already applied.

-- 1. Public distinction. A published form accepts submissions at its public URL. Only
--    active forms can be published; archiving clears this flag.
ALTER TABLE "lead_forms" ADD COLUMN IF NOT EXISTS "published" boolean DEFAULT false NOT NULL;

-- 2. Form settings: source attribution label and consent copy.
--    Shape: { "sourceLabel": string|null, "consentText": string|null }
ALTER TABLE "lead_forms" ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;

-- 3. Keep existing public forms public. Before this change every active form accepted
--    submissions at its URL. The table holds one row per form (a small, company-bounded
--    set), so a single UPDATE is acceptable here.
UPDATE "lead_forms" SET "published" = true WHERE "active" = true AND "published" = false;

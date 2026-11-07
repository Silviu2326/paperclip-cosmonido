-- Additive SQL fragment for official Better Auth twoFactor persistence and company retention preferences.
ALTER TABLE "user"
  ADD COLUMN "two_factor_enabled" boolean NOT NULL DEFAULT false;

CREATE TABLE "twoFactor" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "secret" text NOT NULL,
  "backup_codes" text NOT NULL,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "verified" boolean NOT NULL DEFAULT false,
  "failed_verification_count" integer NOT NULL DEFAULT 0,
  "locked_until" timestamptz
);
CREATE UNIQUE INDEX "two_factor_user_id_uq" ON "twoFactor" ("user_id");

CREATE TABLE "productization_company_retention" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "retention_days" integer NOT NULL DEFAULT 365,
  "updated_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "productization_company_retention_days_check"
    CHECK ("retention_days" BETWEEN 1 AND 3650)
);
CREATE UNIQUE INDEX "productization_company_retention_company_uq"
  ON "productization_company_retention" ("company_id");

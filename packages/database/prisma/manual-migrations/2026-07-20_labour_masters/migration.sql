-- ============================================================================
-- Labour Masters (app_quikinfra) — Section 1 provisioning migration
-- ----------------------------------------------------------------------------
-- Adds the three labour master tables backing the Labour module:
--   • Labour_categories   (CnLabourCategory) — trade + skill taxonomy
--   • Labour_rates        (CnLabourRate)     — effective-dated wage registry
--   • Workmen             (CnWorkman)        — individual worker identity
--
-- Pure additive migration — no existing table is touched, no backfill needed.
-- IDEMPOTENT: every statement is guarded (IF NOT EXISTS / duplicate_object
-- catch), so re-running on a DB where some/all objects already exist is a no-op.
--
-- Org (the tenant root) lives in schema "quikit"; all FKs cascade from it.
-- Types mirror what Prisma generates from schema.prisma exactly (no drift):
--   String -> TEXT · Decimal(18,2) -> DECIMAL(18,2) · @db.Date -> DATE
--   DateTime -> TIMESTAMP(3) · String[] -> TEXT[]
--
-- Run inside a single transaction. On psql:  \i this_file.sql
-- After applying, run `npx prisma generate` so the client exposes the models.
-- ============================================================================

BEGIN;

-- ─── CnLabourCategory → "Labour_categories" ────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikinfra"."Labour_categories" (
    "id"           TEXT NOT NULL,
    "orgId"        TEXT NOT NULL,
    "code"         TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "skillLevel"   TEXT NOT NULL,
    "trade"        TEXT,
    "defaultUomId" TEXT,
    "description"  TEXT,
    "status"       TEXT NOT NULL DEFAULT 'active',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    "createdBy"    TEXT NOT NULL,
    "updatedBy"    TEXT NOT NULL,
    CONSTRAINT "Labour_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Labour_categories_orgId_code_key"
    ON "app_quikinfra"."Labour_categories"("orgId", "code");
CREATE INDEX IF NOT EXISTS "Labour_categories_orgId_idx"
    ON "app_quikinfra"."Labour_categories"("orgId");

DO $$ BEGIN
  ALTER TABLE "app_quikinfra"."Labour_categories"
    ADD CONSTRAINT "Labour_categories_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── CnLabourRate → "Labour_rates" ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikinfra"."Labour_rates" (
    "id"               TEXT NOT NULL,
    "orgId"            TEXT NOT NULL,
    "labourCategoryId" TEXT NOT NULL,
    "projectId"        TEXT,
    "rateType"         TEXT NOT NULL,
    "rate"             DECIMAL(18,2) NOT NULL,
    "effectiveFrom"    DATE NOT NULL,
    "effectiveTo"      DATE,
    "approvalStatus"   TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalId"       TEXT,
    "status"           TEXT NOT NULL DEFAULT 'active',
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    "createdBy"        TEXT NOT NULL,
    "updatedBy"        TEXT NOT NULL,
    CONSTRAINT "Labour_rates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Labour_rates_orgId_idx"
    ON "app_quikinfra"."Labour_rates"("orgId");
CREATE INDEX IF NOT EXISTS "Labour_rates_orgId_labourCategoryId_projectId_effectiveFrom_idx"
    ON "app_quikinfra"."Labour_rates"("orgId", "labourCategoryId", "projectId", "effectiveFrom");

DO $$ BEGIN
  ALTER TABLE "app_quikinfra"."Labour_rates"
    ADD CONSTRAINT "Labour_rates_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── CnWorkman → "Workmen" ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikinfra"."Workmen" (
    "id"                  TEXT NOT NULL,
    "orgId"               TEXT NOT NULL,
    "workmanCode"         TEXT NOT NULL,
    "fullName"            TEXT NOT NULL,
    "fatherOrSpouse"      TEXT,
    "gender"              TEXT,
    "dateOfBirth"         DATE,
    "phone"               TEXT,
    "photoFileId"         TEXT,
    "idProofType"         TEXT,
    "idProofLast4"        TEXT,
    "labourCategoryId"    TEXT NOT NULL,
    "engagementType"      TEXT NOT NULL,
    "contractorId"        TEXT,
    "dailyWage"           DECIMAL(18,2),
    "bankAccountLast4"    TEXT,
    "ifsc"                TEXT,
    "joiningDate"         DATE,
    "exitDate"            DATE,
    "projectIds"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "safetyInductionDone" BOOLEAN NOT NULL DEFAULT false,
    "status"              TEXT NOT NULL DEFAULT 'active',
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    "createdBy"           TEXT NOT NULL,
    "updatedBy"           TEXT NOT NULL,
    CONSTRAINT "Workmen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Workmen_orgId_workmanCode_key"
    ON "app_quikinfra"."Workmen"("orgId", "workmanCode");
CREATE INDEX IF NOT EXISTS "Workmen_orgId_idx"
    ON "app_quikinfra"."Workmen"("orgId");
CREATE INDEX IF NOT EXISTS "Workmen_orgId_labourCategoryId_idx"
    ON "app_quikinfra"."Workmen"("orgId", "labourCategoryId");
CREATE INDEX IF NOT EXISTS "Workmen_orgId_contractorId_idx"
    ON "app_quikinfra"."Workmen"("orgId", "contractorId");

DO $$ BEGIN
  ALTER TABLE "app_quikinfra"."Workmen"
    ADD CONSTRAINT "Workmen_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;

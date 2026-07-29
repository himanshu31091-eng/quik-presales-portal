-- ============================================================================
-- ERP Workflow — consolidated labour/DPR/RAB schema migration (app_quikinfra)
-- ----------------------------------------------------------------------------
-- Single migration merging the separate manual migrations for the ERP labour +
-- DPR/RAB billing workflow. Ordering matters: additive tables and columns are
-- created first, destructive drops run last, so the file is safe to apply
-- top-to-bottom on ANY environment (dev / uat / prod).
--
-- COMMON / ENV-SAFE: every statement is guarded (IF [NOT] EXISTS /
-- duplicate_object catch). In particular the muster-roll tables are only ever
-- DROPPED here, never created — on UAT they were never provisioned, so the drop
-- is a harmless no-op; on any environment where an earlier build created them,
-- it cleans them up. Re-running the whole file is always a no-op.
--
--   Additive tables
--     1. Labour_categories / Labour_rates / Workmen   — labour masters
--   Additive columns
--     2. Work_order_lines.labourCount                 — manpower day-rate qty
--        Work_order_lines.labourCategoryId
--        Boq_progress_ledger.workOrderId (+ index)    — DPR→WO billing link
--        Dpr_work_items.location                      — work-item chainage
--   Destructive — columns
--     3. Work_order_lines.labourCounts (column drop)  — reverted trade-count grid
--        Grn_lines.heatNo             (column drop)  — always-NULL unused column
--   Destructive — tables
--     4. Muster_rolls + Muster_roll_lines             — reverted (see note above)
--        Financial_years                              — FY now computed from date
--        Internal_returns + Internal_return_lines     — abandoned subsystem
--        Banks                                        — orphaned legacy table
--        Boq_items v1                                 — superseded by Boq_items_v2
--
-- Org (the tenant root) lives in schema "quikit"; all new FKs cascade from it.
-- Types mirror what Prisma generates from schema.prisma exactly (no drift):
--   String -> TEXT · Decimal(18,2) -> DECIMAL(18,2) · @db.Date -> DATE
--   DateTime -> TIMESTAMP(3) · String[] -> TEXT[]
--
-- Runs inside a single transaction. On psql:  \i this_file.sql
-- After applying, run `npx prisma generate` so the client exposes the models.
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — Labour masters (additive; no existing table touched)
--   • Labour_categories (CnLabourCategory) — trade + skill taxonomy
--   • Labour_rates       (CnLabourRate)     — effective-dated wage registry
--   • Workmen            (CnWorkman)        — individual worker identity
-- ════════════════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — Additive columns (nullable, no backfill)
--   • Work_order_lines.labourCount     — manpower on a labour day-rate line.
--     Amount = labourCount × quantity(days) × negotiatedRate(rate/day).
--   • Work_order_lines.labourCategoryId — FK CnLabourCategory for LABOUR_CATEGORY
--     (manpower day-rate) WO lines.
--   • Boq_progress_ledger.workOrderId  — carries the labour WO reference from an
--     approved DPR quantity line into the progress ledger (DPR→WO billing link).
--   • Dpr_work_items.location          — free-text site location / chainage per
--     Work Done activity (was captured by the form but had no column to land in).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE "app_quikinfra"."Work_order_lines"
  ADD COLUMN IF NOT EXISTS "labourCount" DECIMAL(18,4);

ALTER TABLE "app_quikinfra"."Work_order_lines"
  ADD COLUMN IF NOT EXISTS "labourCategoryId" TEXT;

ALTER TABLE "app_quikinfra"."Boq_progress_ledger"
  ADD COLUMN IF NOT EXISTS "workOrderId" TEXT;

CREATE INDEX IF NOT EXISTS "Boq_progress_ledger_workOrderId_idx"
  ON "app_quikinfra"."Boq_progress_ledger"("workOrderId");

ALTER TABLE "app_quikinfra"."Dpr_work_items"
  ADD COLUMN IF NOT EXISTS "location" TEXT;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — Destructive: drop unused / reverted columns
--   • Work_order_lines.labourCounts — the "Labour Type & Count" grid feature was
--     removed (frontend + backend); this drops its backing JSON column. See
--     docs/reverted-labour-trade-count.md to restore (restoring now also
--     requires re-adding this column). NOTE: distinct from `labourCount` added
--     in Section 2 — the old plural JSON column is gone, the new scalar stays.
--   • Grn_lines.heatNo — the Record GRN form only ever collected a single
--     combined "Batch / Heat No." value (stored in batchNo); heatNo had no
--     input and was always NULL, so the column carried no data.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE "app_quikinfra"."Work_order_lines" DROP COLUMN IF EXISTS "labourCounts";

ALTER TABLE "app_quikinfra"."Grn_lines" DROP COLUMN IF EXISTS "heatNo";

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — Destructive: drop reverted / dead tables
--   Each table's model was removed from schema.prisma and no runtime code reads
--   it. FK constraints are dropped first (IF EXISTS so a name mismatch is a
--   no-op); child tables drop before parents to satisfy FK ordering. Every drop
--   is IF EXISTS, so on an environment that never had the table (e.g. muster
--   rolls on UAT) the statement is a safe no-op.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Muster_rolls + Muster_roll_lines — Section reverted (never added on UAT) ─
-- Attendance was integrated into another module; the create migration was
-- dropped before it reached UAT. IF EXISTS makes this common across all envs.
DROP TABLE IF EXISTS "app_quikinfra"."Muster_roll_lines" CASCADE;
DROP TABLE IF EXISTS "app_quikinfra"."Muster_rolls" CASCADE;

-- ─── Financial_years (CnFinancialYear) — Reports FY now computed from date ──
ALTER TABLE "app_quikinfra"."Financial_years" DROP CONSTRAINT IF EXISTS "Financial_years_companyId_fkey";
ALTER TABLE "app_quikinfra"."Financial_years" DROP CONSTRAINT IF EXISTS "Financial_years_orgId_fkey";
DROP TABLE IF EXISTS "app_quikinfra"."Financial_years";

-- ─── Internal_returns + Internal_return_lines (abandoned subsystem) ─────────
-- Child (lines) dropped before parent (returns) to satisfy FK ordering.
ALTER TABLE "app_quikinfra"."Internal_return_lines" DROP CONSTRAINT IF EXISTS "Internal_return_lines_returnId_fkey";
ALTER TABLE "app_quikinfra"."Internal_return_lines" DROP CONSTRAINT IF EXISTS "Internal_return_lines_itemId_fkey";
ALTER TABLE "app_quikinfra"."Internal_return_lines" DROP CONSTRAINT IF EXISTS "Internal_return_lines_uomId_fkey";
ALTER TABLE "app_quikinfra"."Internal_returns" DROP CONSTRAINT IF EXISTS "Internal_returns_projectId_fkey";
ALTER TABLE "app_quikinfra"."Internal_returns" DROP CONSTRAINT IF EXISTS "Internal_returns_issueId_fkey";
ALTER TABLE "app_quikinfra"."Internal_returns" DROP CONSTRAINT IF EXISTS "Internal_returns_locationId_fkey";
ALTER TABLE "app_quikinfra"."Internal_returns" DROP CONSTRAINT IF EXISTS "Internal_returns_orgId_fkey";
DROP TABLE IF EXISTS "app_quikinfra"."Internal_return_lines";
DROP TABLE IF EXISTS "app_quikinfra"."Internal_returns";

-- ─── Banks (CnBank) — orphaned legacy table ────────────────────────────────
ALTER TABLE "app_quikinfra"."Banks" DROP CONSTRAINT IF EXISTS "Banks_companyId_fkey";
ALTER TABLE "app_quikinfra"."Banks" DROP CONSTRAINT IF EXISTS "Banks_orgId_fkey";
DROP TABLE IF EXISTS "app_quikinfra"."Banks" CASCADE;

-- ─── Boq_items v1 (CnBOQItem) — superseded by Boq_items_v2 ──────────────────
-- No other table has a foreign key INTO "Boq_items": every boqItemId column is a
-- plain string, not an FK. The only constraints live ON "Boq_items" itself
-- (projectId + self-referential parentId). CASCADE clears the self-ref on drop.
ALTER TABLE "app_quikinfra"."Boq_items" DROP CONSTRAINT IF EXISTS "Boq_items_projectId_fkey";
ALTER TABLE "app_quikinfra"."Boq_items" DROP CONSTRAINT IF EXISTS "Boq_items_parentId_fkey";
DROP TABLE IF EXISTS "app_quikinfra"."Boq_items" CASCADE;

COMMIT;
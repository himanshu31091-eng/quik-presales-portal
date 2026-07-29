-- ============================================================================
-- QuikAsset — consolidated additive schema changes (week of 2026-07-14 → 07-20)
-- ============================================================================
-- Baseline : app_quikasset as of the AssetManagement branch (commit afed028e)
-- Target   : merge_asset02 (current)
-- Scope    : the `app_quikasset` Postgres schema ONLY. Purely additive —
--            new tables/enums/columns/indexes/FKs. No drops, no data rewrites,
--            no column type changes. The legacy `repairs.vendor` text column is
--            intentionally KEPT.
--
-- Features included (each maps 1:1 to a SCHEMA_CHANGELOG.md entry):
--   1. Employee ↔ User identity bridge   (2026-07-14)
--   2. User soft-delete                  (2026-07-14)
--   3. Asset Request                     (2026-07-15)
--   4. Vendor Management                 (2026-07-17)
--   5. Employee Repair Request           (2026-07-20)
--   6. Actor attribution columns         (2026-07-20)
--
-- Safe to run start-to-finish: idempotent (IF NOT EXISTS on tables/columns/
-- indexes; enum + FK creation guarded so a re-run or partial prior state won't
-- error). Wrapped in one transaction — all-or-nothing.
--
-- Prereq: the `auth."User"` table must exist (shared platform schema) — the
-- identity-bridge FK in section 1 references it.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Employee ↔ User identity bridge  (2026-07-14)
--    Link AstEmployee → platform auth.User.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app_quikasset"."employees" ADD COLUMN IF NOT EXISTS "userId" TEXT;

CREATE INDEX IF NOT EXISTS "employees_userId_idx"
  ON "app_quikasset"."employees"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "employees_orgId_userId_key"
  ON "app_quikasset"."employees"("orgId", "userId");

DO $$ BEGIN
  ALTER TABLE "app_quikasset"."employees"
    ADD CONSTRAINT "employees_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "auth"."User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. User soft-delete  (2026-07-14)
--    Hide/deny a removed user from QuikAsset without destroying their data.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikasset"."user_removals" (
    "id"        TEXT NOT NULL,
    "orgId"     TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedBy" TEXT,
    CONSTRAINT "user_removals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_removals_orgId_idx"
  ON "app_quikasset"."user_removals"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "user_removals_orgId_userId_key"
  ON "app_quikasset"."user_removals"("orgId", "userId");

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Asset Request  (2026-07-15)
--    Employee request → admin approval → fulfilment (creates an assignment).
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "app_quikasset"."AstAssetRequestKind" AS ENUM ('Physical', 'Subscription');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikasset"."AstAssetRequestType" AS ENUM ('New', 'Replacement', 'Upgrade', 'Additional');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikasset"."AstAssetRequestPriority" AS ENUM ('Low', 'Medium', 'High', 'Urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikasset"."AstAssetRequestStatus" AS ENUM ('Draft', 'Submitted', 'PendingApproval', 'Approved', 'Rejected', 'PartiallyFulfilled', 'Fulfilled', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Invoice-file attachment columns on assets.
ALTER TABLE "app_quikasset"."assets" ADD COLUMN IF NOT EXISTS "invoiceFileKey"  TEXT;
ALTER TABLE "app_quikasset"."assets" ADD COLUMN IF NOT EXISTS "invoiceFileName" TEXT;
ALTER TABLE "app_quikasset"."assets" ADD COLUMN IF NOT EXISTS "invoiceFileType" TEXT;
ALTER TABLE "app_quikasset"."assets" ADD COLUMN IF NOT EXISTS "invoiceFileSize" INTEGER;

-- Link a fulfilled assignment back to its originating request.
ALTER TABLE "app_quikasset"."assignments" ADD COLUMN IF NOT EXISTS "requestId" TEXT;

CREATE TABLE IF NOT EXISTS "app_quikasset"."asset_requests" (
    "id"                TEXT NOT NULL,
    "orgId"             TEXT NOT NULL,
    "requesterUserId"   TEXT NOT NULL,
    "itemKind"          "app_quikasset"."AstAssetRequestKind" NOT NULL DEFAULT 'Physical',
    "itemType"          TEXT NOT NULL,
    "baseCategoryId"    TEXT,
    "categoryId"        TEXT,
    "requestType"       "app_quikasset"."AstAssetRequestType" NOT NULL,
    "quantity"          INTEGER NOT NULL DEFAULT 1,
    "quantityFulfilled" INTEGER NOT NULL DEFAULT 0,
    "justification"     TEXT NOT NULL,
    "priority"          "app_quikasset"."AstAssetRequestPriority" NOT NULL DEFAULT 'Medium',
    "requiredBy"        TEXT,
    "status"            "app_quikasset"."AstAssetRequestStatus" NOT NULL DEFAULT 'Draft',
    "reviewedByUserId"  TEXT,
    "reviewedAt"        TIMESTAMP(3),
    "decisionNote"      TEXT,
    "fulfilmentNote"    TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "asset_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "asset_requests_orgId_idx"           ON "app_quikasset"."asset_requests"("orgId");
CREATE INDEX IF NOT EXISTS "asset_requests_orgId_status_idx"    ON "app_quikasset"."asset_requests"("orgId", "status");
CREATE INDEX IF NOT EXISTS "asset_requests_requesterUserId_idx" ON "app_quikasset"."asset_requests"("requesterUserId");
CREATE INDEX IF NOT EXISTS "assignments_requestId_idx"          ON "app_quikasset"."assignments"("requestId");

DO $$ BEGIN
  ALTER TABLE "app_quikasset"."assignments"
    ADD CONSTRAINT "assignments_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "app_quikasset"."asset_requests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Vendor Management  (2026-07-17)
--    Vendor master + link a vendor to Repair records. Legacy repairs.vendor kept.
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "app_quikasset"."AstVendorStatus" AS ENUM ('Active', 'Inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "app_quikasset"."vendors" (
    "id"            TEXT NOT NULL,
    "orgId"         TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone"         TEXT,
    "email"         TEXT,
    "address"       TEXT,
    "status"        "app_quikasset"."AstVendorStatus" NOT NULL DEFAULT 'Active',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "app_quikasset"."repairs" ADD COLUMN IF NOT EXISTS "vendorId" TEXT;

CREATE INDEX IF NOT EXISTS "vendors_orgId_idx"    ON "app_quikasset"."vendors"("orgId");
CREATE INDEX IF NOT EXISTS "repairs_vendorId_idx" ON "app_quikasset"."repairs"("vendorId");

DO $$ BEGIN
  ALTER TABLE "app_quikasset"."repairs"
    ADD CONSTRAINT "repairs_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "app_quikasset"."vendors"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Employee Repair Request  (2026-07-20)
--    Employee-raised repair intake → approver → "send to repair" (creates repair).
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "app_quikasset"."AstRepairRequestStatus" AS ENUM ('Submitted', 'Approved', 'Rejected', 'Fulfilled', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikasset"."AstRepairRequestUrgency" AS ENUM ('Low', 'Medium', 'High', 'Urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "app_quikasset"."repair_requests" (
    "id"               TEXT NOT NULL,
    "orgId"            TEXT NOT NULL,
    "requesterUserId"  TEXT NOT NULL,
    "assetId"          TEXT NOT NULL,
    "issueTitle"       TEXT NOT NULL,
    "issueDescription" TEXT NOT NULL,
    "urgency"          "app_quikasset"."AstRepairRequestUrgency" NOT NULL DEFAULT 'Medium',
    "status"           "app_quikasset"."AstRepairRequestStatus" NOT NULL DEFAULT 'Submitted',
    "reviewedByUserId" TEXT,
    "reviewedAt"       TIMESTAMP(3),
    "decisionNote"     TEXT,
    "repairId"         TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "repair_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "repair_requests_orgId_idx"           ON "app_quikasset"."repair_requests"("orgId");
CREATE INDEX IF NOT EXISTS "repair_requests_orgId_status_idx"    ON "app_quikasset"."repair_requests"("orgId", "status");
CREATE INDEX IF NOT EXISTS "repair_requests_requesterUserId_idx" ON "app_quikasset"."repair_requests"("requesterUserId");
CREATE INDEX IF NOT EXISTS "repair_requests_assetId_idx"         ON "app_quikasset"."repair_requests"("assetId");
CREATE INDEX IF NOT EXISTS "repair_requests_repairId_idx"        ON "app_quikasset"."repair_requests"("repairId");

DO $$ BEGIN
  ALTER TABLE "app_quikasset"."repair_requests"
    ADD CONSTRAINT "repair_requests_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "app_quikasset"."assets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikasset"."repair_requests"
    ADD CONSTRAINT "repair_requests_repairId_fkey"
    FOREIGN KEY ("repairId") REFERENCES "app_quikasset"."repairs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Actor attribution columns  (2026-07-20)
--    "Who performed this action" — platform User.id (nullable, no FK), surfaced
--    as Added by / Assigned by / Sent to repair by in the UI.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app_quikasset"."assets"      ADD COLUMN IF NOT EXISTS "createdByUserId"  TEXT;
ALTER TABLE "app_quikasset"."assignments" ADD COLUMN IF NOT EXISTS "assignedByUserId" TEXT;
ALTER TABLE "app_quikasset"."repairs"     ADD COLUMN IF NOT EXISTS "createdByUserId"  TEXT;

COMMIT;

-- ============================================================================
-- End. Optional (data, not schema): backfill the actor columns for pre-existing
-- rows from AstAuditLog — see apps/quikasset/scripts/backfill-actor-attribution.ts
-- ============================================================================

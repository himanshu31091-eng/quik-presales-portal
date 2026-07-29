-- Two-axis CategoryMaster + Goals carry-forward
--
-- See apps/quikscale/CHANGES (OPSP-CHANGES.md) §1.1 and §2.1.
--
-- This migration is intentionally idempotent. Some envs may already have
-- partial state from the prior ad-hoc ALTER TABLE on `new-rohit-dev`, so
-- every step uses IF NOT EXISTS and guarded UPDATEs that skip already-
-- migrated rows.
--
-- Old breakdownType enum: Cumulative | Standalone | CumulativeTillExit | Manual
-- New (categoryType, breakdownType) pair:
--   Cumulative          -> (Cumulative,         Automatic)
--   Standalone          -> (Standalone,         Automatic)
--   CumulativeTillExit  -> (CumulativeTillEnd,  Automatic)
--   Manual              -> (Cumulative,         Manual)

-- 1. Add the new columns (no-op if already present).
ALTER TABLE "app_quikscale"."CategoryMaster"
  ADD COLUMN IF NOT EXISTS "categoryType" TEXT;
ALTER TABLE "app_quikscale"."CategoryMaster"
  ADD COLUMN IF NOT EXISTS "breakdownType" TEXT;

-- 2. Backfill categoryType for rows where it's still NULL — derive from the
--    existing breakdownType value (which may carry legacy enum values, the
--    new "Automatic"/"Manual" values, or NULL on a brand-new column).
UPDATE "app_quikscale"."CategoryMaster"
SET "categoryType" = CASE
  WHEN "breakdownType" = 'CumulativeTillExit' THEN 'CumulativeTillEnd'
  WHEN "breakdownType" = 'Standalone'         THEN 'Standalone'
  WHEN "breakdownType" IN ('Cumulative', 'Manual') THEN 'Cumulative'
  ELSE 'Cumulative'
END
WHERE "categoryType" IS NULL;

-- 3. Rewrite breakdownType into the new two-value enum. Manual stays Manual;
--    every other legacy value (and NULL on a fresh column) maps to Automatic.
UPDATE "app_quikscale"."CategoryMaster"
SET "breakdownType" = CASE
  WHEN "breakdownType" = 'Manual'    THEN 'Manual'
  WHEN "breakdownType" = 'Automatic' THEN 'Automatic'
  ELSE 'Automatic'
END
WHERE "breakdownType" IS NULL
   OR "breakdownType" NOT IN ('Manual', 'Automatic');

-- 4. Lock in defaults and NOT NULL — matches @default("Cumulative") /
--    @default("Automatic") in the Prisma schema.
ALTER TABLE "app_quikscale"."CategoryMaster"
  ALTER COLUMN "categoryType"  SET DEFAULT 'Cumulative';
ALTER TABLE "app_quikscale"."CategoryMaster"
  ALTER COLUMN "categoryType"  SET NOT NULL;
ALTER TABLE "app_quikscale"."CategoryMaster"
  ALTER COLUMN "breakdownType" SET DEFAULT 'Automatic';
ALTER TABLE "app_quikscale"."CategoryMaster"
  ALTER COLUMN "breakdownType" SET NOT NULL;

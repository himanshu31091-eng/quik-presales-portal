-- Collapses Stock reconciliation into a single table: moves the relational
-- "Stock_reconciliation_lines" rows into a JSONB `materials` array on the
-- "Stock_reconciliations" header (same single-table pattern as issues /
-- transfers / gate-pass / good-return). The CnStockReconciliationLine model
-- has been removed from schema.prisma; the routes now read/write `materials`.
--
-- This table HAS DATA in UAT/PROD, so this is an EXPAND -> BACKFILL -> CONTRACT
-- migration, wrapped in a transaction. It is NOT a plain drop.
--
-- Run per environment (dev -> uat -> prod). Take a backup/snapshot first — the
-- CONTRACT step drops the source table and is not reversible without a restore.

BEGIN;

-- 1. EXPAND — add the new columns (idempotent).
ALTER TABLE "app_quikinfra"."Stock_reconciliations"
  ADD COLUMN IF NOT EXISTS "lineCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "app_quikinfra"."Stock_reconciliations"
  ADD COLUMN IF NOT EXISTS "materials" JSONB;

-- 2. BACKFILL — fold each header's line rows into a JSON array + count.
--    Line element shape matches the ReconLine interface the route reads.
UPDATE "app_quikinfra"."Stock_reconciliations" r
SET "materials" = COALESCE(agg.arr, '[]'::jsonb),
    "lineCount" = COALESCE(agg.cnt, 0)
FROM (
  SELECT l."reconciliationId" AS rid,
         jsonb_agg(
           jsonb_build_object(
             'id',          l."id",
             'itemId',      l."itemId",
             'uomId',       l."uomId",
             'systemQty',   l."systemQty",
             'physicalQty', l."physicalQty",
             'varianceQty', l."varianceQty",
             'reason',      l."reason"
           )
         ) AS arr,
         count(*) AS cnt
  FROM "app_quikinfra"."Stock_reconciliation_lines" l
  GROUP BY l."reconciliationId"
) agg
WHERE r."id" = agg.rid;

-- Headers with no line rows: leave materials as an empty array, not NULL,
-- so the route's Array.isArray() check yields [] rather than a stray null.
UPDATE "app_quikinfra"."Stock_reconciliations"
SET "materials" = '[]'::jsonb
WHERE "materials" IS NULL;

-- 3. CONTRACT — drop the now-redundant relational line table.
ALTER TABLE "app_quikinfra"."Stock_reconciliation_lines" DROP CONSTRAINT IF EXISTS "Stock_reconciliation_lines_reconciliationId_fkey";
ALTER TABLE "app_quikinfra"."Stock_reconciliation_lines" DROP CONSTRAINT IF EXISTS "Stock_reconciliation_lines_itemId_fkey";
ALTER TABLE "app_quikinfra"."Stock_reconciliation_lines" DROP CONSTRAINT IF EXISTS "Stock_reconciliation_lines_uomId_fkey";
DROP TABLE IF EXISTS "app_quikinfra"."Stock_reconciliation_lines" CASCADE;

COMMIT;

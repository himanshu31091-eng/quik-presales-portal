-- ============================================================================
-- Store documents — collapse relational line tables into JSONB (app_quikinfra)
-- ----------------------------------------------------------------------------
-- Single migration merging the store-document line-table cleanups authored
-- after the 2026-07-22 consolidation (2026-07-22_erp_workflow_labour_schema).
-- Only migrations NOT already in that file are included here.
--
-- Every store document now stores its line items as a JSONB `materials` column
-- on the header table (the single-table pattern used by issues / transfers /
-- gate-pass / good-return / reconciliation). The old relational *_lines tables
-- are dead — no application code or seed reads or writes them — so they are
-- dropped. Stock reconciliation is the exception: its line table HAS DATA in
-- UAT/PROD, so it is migrated (expand → backfill → contract), not just dropped.
--
--   Destructive — dead line tables (JSONB-superseded, no data of value)
--     1. Gate_pass_lines        (CnGatePassLine)
--        Good_return_lines      (CnGoodReturnLine)
--        Material_issue_lines   (CnMaterialIssueLine)
--        Stock_transfer_lines   (CnStockTransferLine)
--   Data migration — expand → backfill → contract (HAS DATA)
--     2. Stock_reconciliation_lines → Stock_reconciliations.materials (JSONB)
--                                     + Stock_reconciliations.lineCount
--
-- ⚠ BACKUP FIRST: Section 2's CONTRACT step drops "Stock_reconciliation_lines"
--   after folding its rows into the header. That is not reversible without a
--   restore. Run per environment in order: dev → uat → prod.
--
-- IDEMPOTENT: every statement is guarded (IF [NOT] EXISTS). FK constraints are
-- dropped first (IF EXISTS so a name mismatch is a no-op); CASCADE clears any
-- remaining constraint ON the dropped table. Runs inside a single transaction.
-- After applying, run `npx prisma generate` so the client drops the models.
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — Drop dead relational line tables (superseded by JSONB materials)
--   Each header table stores its lines as a JSONB `materials` column; the
--   relational *_lines table is never read or written by application code (nor
--   by any seed), and each CnXxxLine model has been removed from schema.prisma.
--   No other table has a foreign key INTO these tables — the only constraints
--   live ON each table (parent FK + plain-string itemId/uomId). CASCADE clears
--   them on drop.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Gate_pass_lines (CnGatePassLine) → JSONB on "Gate_passes" ─────────────
ALTER TABLE "app_quikinfra"."Gate_pass_lines" DROP CONSTRAINT IF EXISTS "Gate_pass_lines_gatePassId_fkey";
DROP TABLE IF EXISTS "app_quikinfra"."Gate_pass_lines" CASCADE;

-- ─── Good_return_lines (CnGoodReturnLine) → JSONB on "Good_returns" ────────
ALTER TABLE "app_quikinfra"."Good_return_lines" DROP CONSTRAINT IF EXISTS "Good_return_lines_returnId_fkey";
DROP TABLE IF EXISTS "app_quikinfra"."Good_return_lines" CASCADE;

-- ─── Material_issue_lines (CnMaterialIssueLine) → JSONB on "cn_material_issues" ─
ALTER TABLE "app_quikinfra"."Material_issue_lines" DROP CONSTRAINT IF EXISTS "Material_issue_lines_issueId_fkey";
ALTER TABLE "app_quikinfra"."Material_issue_lines" DROP CONSTRAINT IF EXISTS "Material_issue_lines_itemId_fkey";
ALTER TABLE "app_quikinfra"."Material_issue_lines" DROP CONSTRAINT IF EXISTS "Material_issue_lines_uomId_fkey";
DROP TABLE IF EXISTS "app_quikinfra"."Material_issue_lines" CASCADE;

-- ─── Stock_transfer_lines (CnStockTransferLine) → JSONB on "Stock_transfers" ─
ALTER TABLE "app_quikinfra"."Stock_transfer_lines" DROP CONSTRAINT IF EXISTS "Stock_transfer_lines_transferId_fkey";
ALTER TABLE "app_quikinfra"."Stock_transfer_lines" DROP CONSTRAINT IF EXISTS "Stock_transfer_lines_itemId_fkey";
ALTER TABLE "app_quikinfra"."Stock_transfer_lines" DROP CONSTRAINT IF EXISTS "Stock_transfer_lines_uomId_fkey";
DROP TABLE IF EXISTS "app_quikinfra"."Stock_transfer_lines" CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — Stock reconciliation: collapse lines into JSONB (HAS DATA)
--   EXPAND → BACKFILL → CONTRACT. Moves relational
--   "Stock_reconciliation_lines" rows into a JSONB `materials` array on the
--   "Stock_reconciliations" header (same single-table pattern as above), then
--   drops the source table. ⚠ Not reversible without a restore — back up first.
-- ════════════════════════════════════════════════════════════════════════════

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

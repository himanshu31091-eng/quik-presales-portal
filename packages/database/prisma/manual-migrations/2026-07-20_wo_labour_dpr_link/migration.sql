-- ============================================================================
-- Section 3 — Work Order labour + DPR→WO billing link (additive)
-- ----------------------------------------------------------------------------
--   • Work_order_lines.labourCategoryId  — FK CnLabourCategory for
--     LABOUR_CATEGORY (manpower day-rate) WO lines.
--   • Boq_progress_ledger.workOrderId    — carries the labour WO reference from
--     an approved DPR quantity line into the progress ledger. This is the link
--     that lets Section 4 bill a LABOUR_ONLY work order from ledger rows.
--
-- Pure additive, nullable, no backfill. Idempotent. Run inside one transaction.
-- After applying, run `npx prisma generate`.
-- ============================================================================

BEGIN;

ALTER TABLE "app_quikinfra"."Work_order_lines"
  ADD COLUMN IF NOT EXISTS "labourCategoryId" TEXT;

ALTER TABLE "app_quikinfra"."Boq_progress_ledger"
  ADD COLUMN IF NOT EXISTS "workOrderId" TEXT;

CREATE INDEX IF NOT EXISTS "Boq_progress_ledger_workOrderId_idx"
  ON "app_quikinfra"."Boq_progress_ledger"("workOrderId");

COMMIT;

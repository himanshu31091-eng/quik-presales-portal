-- ============================================================================
-- DPR work item location / chainage (app_quikinfra)
-- ----------------------------------------------------------------------------
-- Adds Dpr_work_items.location so each Work Done activity records the free-text
-- site location / chainage entered in the DPR form. The field was captured and
-- sent by the form but had no column to land in, so it was silently dropped on
-- save and never shown on the detail view. This closes that gap.
--
-- Additive, nullable, no backfill. Idempotent (IF NOT EXISTS). One transaction.
-- Types mirror Prisma: String? -> TEXT (nullable).
-- After applying, run `npx prisma generate` so the client exposes the field.
-- ============================================================================

BEGIN;

ALTER TABLE "app_quikinfra"."Dpr_work_items"
  ADD COLUMN IF NOT EXISTS "location" TEXT;

COMMIT;

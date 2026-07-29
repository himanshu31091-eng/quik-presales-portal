-- ============================================================================
-- Remove the trade-count grid column from work order lines.
-- The "Labour Type & Count" feature was removed (frontend + backend); this
-- drops the backing JSON column. See docs/reverted-labour-trade-count.md to
-- restore (restoring now also requires re-adding this column).
--
-- Idempotent. Run inside one transaction.
-- ============================================================================

BEGIN;

ALTER TABLE "app_quikinfra"."Work_order_lines" DROP COLUMN IF EXISTS "labourCounts";

COMMIT;

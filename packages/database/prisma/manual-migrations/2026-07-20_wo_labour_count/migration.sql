-- ============================================================================
-- Add labourCount to work order lines (manpower on a labour day-rate line).
-- Amount = labourCount × quantity(days) × negotiatedRate(rate/day).
-- Additive, nullable, idempotent. After applying, run `npx prisma generate`.
-- ============================================================================

BEGIN;

ALTER TABLE "app_quikinfra"."Work_order_lines"
  ADD COLUMN IF NOT EXISTS "labourCount" DECIMAL(18,4);

COMMIT;

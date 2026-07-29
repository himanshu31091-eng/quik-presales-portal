-- ============================================================================
-- Drop the unused `heatNo` column from GRN lines.
-- The Record GRN form only ever collected a single combined
-- "Batch / Heat No." value (stored in `batchNo`); `heatNo` had no input and
-- was always NULL, so the column carried no data.
--
-- Idempotent. Run inside one transaction.
-- ============================================================================

BEGIN;

ALTER TABLE "app_quikinfra"."Grn_lines" DROP COLUMN IF EXISTS "heatNo";

COMMIT;
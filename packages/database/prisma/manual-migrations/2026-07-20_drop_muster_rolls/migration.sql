-- ============================================================================
-- Drop the Muster Roll tables (Section 2 removed — attendance integrated into
-- another module). Lines dropped first (FK to header), then the header.
-- Idempotent (IF EXISTS). Run inside one transaction.
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS "app_quikinfra"."Muster_roll_lines" CASCADE;
DROP TABLE IF EXISTS "app_quikinfra"."Muster_rolls" CASCADE;

COMMIT;

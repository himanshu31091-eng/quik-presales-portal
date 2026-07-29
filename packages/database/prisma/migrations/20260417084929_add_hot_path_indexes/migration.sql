-- P1-3: composite indexes for hot multi-column queries.
-- See docs/plans/P1-3-composite-indexes.md.
--
-- NOTE on CONCURRENTLY:
-- An earlier version of this migration used CREATE INDEX CONCURRENTLY to
-- avoid an ACCESS EXCLUSIVE lock during the build. That failed with
-- "CREATE INDEX CONCURRENTLY cannot run inside a transaction block"
-- because Prisma wraps every migration file in an implicit transaction
-- (docs/plans/P1-3-composite-indexes.md §4 had this wrong — corrected).
--
-- At current table sizes (<100K rows) a regular CREATE INDEX completes
-- in tens of milliseconds and the brief lock is imperceptible. Revisit
-- if any of these tables grow past ~1M rows, at which point we should
-- either split the migration per-index and run via psql manually, or
-- adopt the Prisma "shadow DB + resolve" dance to bypass the implicit
-- transaction wrapper.

CREATE INDEX IF NOT EXISTS "Notification_tenantId_userId_read_idx"
  ON "Notification" ("tenantId", "userId", "read");

-- PerformanceReview table doesn't exist in the live schema; guard the
-- index creation so `prisma migrate reset` doesn't fail on this migration.
-- If/when the model is added, this block creates the index automatically.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'PerformanceReview'
  ) THEN
    CREATE INDEX IF NOT EXISTS "PerformanceReview_tenantId_revieweeId_year_quarter_idx"
      ON "PerformanceReview" ("tenantId", "revieweeId", "year", "quarter");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "HabitAssessment_tenantId_quarter_year_idx"
  ON "HabitAssessment" ("tenantId", "quarter", "year");

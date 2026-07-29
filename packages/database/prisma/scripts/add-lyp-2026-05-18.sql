-- 2026-05-18 — Add lastYearSamePeriod to OPSPReviewEntry.
-- Holds the manually-entered "Last Year Same Period" value when no prior-year
-- OPSPReviewEntry exists for the same category + period. When a prior-year
-- value IS available, the drawer disables the field and this column stays null.

ALTER TABLE "app_quikscale"."OPSPReviewEntry"
  ADD COLUMN IF NOT EXISTS "lastYearSamePeriod" DECIMAL(20, 4);

-- QuikTrack: per-project tab customization.
-- Ordered JSON array of enabled tab paths; NULL = show all tabs (default).
-- Idempotent so re-running against an already-patched DB is safe.
ALTER TABLE "app_quiktrack"."QtProject" ADD COLUMN IF NOT EXISTS "tabConfig" JSONB;

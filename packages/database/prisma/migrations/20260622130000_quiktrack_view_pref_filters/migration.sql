-- QuikTrack: auto-persisted filter state per user + project + view surface.
-- Adds a `filters` JSON column to QtUserViewPref (which is already uniquely
-- keyed on (userId, projectId, viewKey)) so each surface's filter state can be
-- upserted alongside its column/settings prefs. No saved-filter library — this
-- is a single sticky filter state per user/project/surface.
--
-- Idempotent so it can be applied to the shared prod Neon DB by hand.
ALTER TABLE app_quiktrack."QtUserViewPref"
  ADD COLUMN IF NOT EXISTS "filters" JSONB;

-- QuikTrack: draft/publish workflow for docs. `status` is "draft" (visible only
-- to its author) or "published" (visible to every project member).
--
-- Idempotent so it can be applied to the shared prod Neon DB by hand.
--
-- The column is created with DEFAULT 'published' so PRE-EXISTING docs (which
-- predate this feature) stay visible to everyone, then the default is switched
-- to 'draft' so NEW docs start private. Doing it via the column default (rather
-- than a backfill UPDATE) keeps this safe to re-run — it never reverts a doc a
-- user has intentionally set to draft.
ALTER TABLE app_quiktrack."QtDoc"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'published';

ALTER TABLE app_quiktrack."QtDoc"
  ALTER COLUMN "status" SET DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS "QtDoc_projectId_status_idx"
  ON app_quiktrack."QtDoc" ("projectId", "status");

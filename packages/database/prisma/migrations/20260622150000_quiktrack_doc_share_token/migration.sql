-- QuikTrack: per-recipient public token for EXTERNAL doc-share invites. The
-- invitee opens /share/<token> with no login (view-only). Null for internal
-- (userId) shares.
--
-- Idempotent so it can be applied to the shared prod Neon DB by hand.
ALTER TABLE app_quiktrack."QtDocShare"
  ADD COLUMN IF NOT EXISTS "token" text;

CREATE UNIQUE INDEX IF NOT EXISTS "QtDocShare_token_key"
  ON app_quiktrack."QtDocShare" ("token");

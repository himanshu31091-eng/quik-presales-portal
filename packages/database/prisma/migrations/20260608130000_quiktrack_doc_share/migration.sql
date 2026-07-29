-- QuikTrack: public share links for docs. `shareToken` holds a short base62
-- code (null = not shared); `shareMode` is "view" | "edit". Idempotent so it
-- can be applied to the shared prod Neon DB by hand.

ALTER TABLE app_quiktrack."QtDoc" ADD COLUMN IF NOT EXISTS "shareToken" text;
ALTER TABLE app_quiktrack."QtDoc" ADD COLUMN IF NOT EXISTS "shareMode" text;

CREATE UNIQUE INDEX IF NOT EXISTS "QtDoc_shareToken_key"
  ON app_quiktrack."QtDoc" ("shareToken");

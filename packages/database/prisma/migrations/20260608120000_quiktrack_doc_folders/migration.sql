-- QuikTrack: single-level folders for the Docs (Pages) tab.
-- Idempotent so it is safe to run against the shared prod Neon DB by hand
-- (the build pipeline does not run `migrate deploy`). Docs at folderId = NULL
-- are "root / uncategorized" — existing rows are untouched.

CREATE TABLE IF NOT EXISTS app_quiktrack."QtDocFolder" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "projectId" text NOT NULL,
  name        text NOT NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdBy" text,
  "updatedBy" text,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "QtDocFolder_orgId_idx"
  ON app_quiktrack."QtDocFolder" ("orgId");

CREATE INDEX IF NOT EXISTS "QtDocFolder_projectId_isDeleted_sortOrder_idx"
  ON app_quiktrack."QtDocFolder" ("projectId", "isDeleted", "sortOrder");

ALTER TABLE app_quiktrack."QtDoc" ADD COLUMN IF NOT EXISTS "folderId" text;
ALTER TABLE app_quiktrack."QtDoc" ADD COLUMN IF NOT EXISTS "sortOrder" integer NOT NULL DEFAULT 0;

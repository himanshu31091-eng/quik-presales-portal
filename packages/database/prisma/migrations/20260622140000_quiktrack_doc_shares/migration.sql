-- QuikTrack: per-user document sharing. Each row grants one user viewer/editor
-- access to a single QtDoc. The doc creator is the implicit Owner (not stored).
-- `email` is reserved for future external invites.
--
-- Idempotent so it can be applied to the shared prod Neon DB by hand.
CREATE TABLE IF NOT EXISTS app_quiktrack."QtDocShare" (
  "id"        text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "docId"     text NOT NULL,
  "userId"    text,
  "email"     text,
  "role"      text NOT NULL,
  "createdBy" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

-- One share per (doc, user) and per (doc, email). NULLs are distinct in
-- Postgres, so email-only rows don't collide on the userId index (and vice
-- versa).
CREATE UNIQUE INDEX IF NOT EXISTS "QtDocShare_docId_userId_key"
  ON app_quiktrack."QtDocShare" ("docId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "QtDocShare_docId_email_key"
  ON app_quiktrack."QtDocShare" ("docId", "email");
CREATE INDEX IF NOT EXISTS "QtDocShare_docId_idx"
  ON app_quiktrack."QtDocShare" ("docId");
CREATE INDEX IF NOT EXISTS "QtDocShare_userId_idx"
  ON app_quiktrack."QtDocShare" ("userId");

-- QuikCRM: Prospects module — capture table for LinkedIn profiles saved via the
-- Chrome extension ("Save to CRM"). This is a standalone capture table, NOT a
-- CrmLead. The extension posts the extracted profile to /api/leads/from-linkedin
-- (Bearer-JWT authed), which upserts one row per (orgId, linkedinUrl). The
-- Prospects settings page lists these rows for the org.
--
-- Idempotent (IF NOT EXISTS) so it is safe to apply by hand; the build pipeline
-- does not run `migrate deploy`. Mirrors the 20260717130000 convention.
-- orgId-scoped; FK to quikit."Org".

CREATE TABLE IF NOT EXISTS app_quikcrm."CrmProspect" (
  id               text PRIMARY KEY,
  "orgId"          text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  name             text NOT NULL,
  email            text,
  phone            text,
  title            text,
  company          text,
  "linkedinUrl"    text,
  "shortSummary"   text,
  about            text,
  "profilePicture" text,
  posts            jsonb,
  "companyData"    jsonb,
  experiences      jsonb,
  "savedById"      text,
  "savedByName"    text,
  "createdAt"      timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"      timestamp(3) NOT NULL
);

-- @@unique([orgId, linkedinUrl]) — one prospect per LinkedIn profile per org.
-- (Postgres treats NULL linkedinUrl values as distinct, so URL-less captures do
-- not collide — matches Prisma's generated unique index semantics.)
CREATE UNIQUE INDEX IF NOT EXISTS "CrmProspect_orgId_linkedinUrl_key"
  ON app_quikcrm."CrmProspect" ("orgId", "linkedinUrl");
-- @@index([orgId]) — org scoping.
CREATE INDEX IF NOT EXISTS "CrmProspect_orgId_idx"
  ON app_quikcrm."CrmProspect" ("orgId");
-- @@index([orgId, createdAt]) — list view, newest first.
CREATE INDEX IF NOT EXISTS "CrmProspect_orgId_createdAt_idx"
  ON app_quikcrm."CrmProspect" ("orgId", "createdAt");

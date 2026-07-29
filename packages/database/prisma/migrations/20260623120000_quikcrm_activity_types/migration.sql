-- QuikCRM: Activity Types + flat custom-field definitions (Phase 1).
-- Admin-configurable activity TYPES (Upwork Connect, LinkedIn DM, …), each with
-- flat custom-field DEFINITIONS. Modeled on the CrmCallDisposition per-org
-- config table. Field VALUES land in a separate indexed CrmActivityFieldValue
-- table in Phase 2 (NOT a JSON blob) so the dashboard/digests can aggregate by
-- value. No cascading fields (no dependsOnKey) — see
-- apps/quikcrm/ACTIVITY-FEATURE-DECISIONS.md (decisions #1, #3).
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) so it is safe to apply to the
-- shared DB by hand; the build pipeline does not run `migrate deploy`. Mirrors
-- the QuikTrack custom-fields migration convention. Index/constraint names
-- match Prisma's generated names for @@unique / @@index so the client stays in
-- sync with the DB.

-- ── Activity types ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmActivityType" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  code        text NOT NULL,
  label       text NOT NULL,
  category    text,
  config      jsonb,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "isActive"  boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL
);

-- @@unique([orgId, code])
CREATE UNIQUE INDEX IF NOT EXISTS "CrmActivityType_orgId_code_key"
  ON app_quikcrm."CrmActivityType" ("orgId", "code");
-- @@index([orgId])
CREATE INDEX IF NOT EXISTS "CrmActivityType_orgId_idx"
  ON app_quikcrm."CrmActivityType" ("orgId");

-- ── Flat custom-field definitions (cascade with their parent type) ──────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmActivityFieldDefinition" (
  id               text PRIMARY KEY,
  "orgId"          text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "activityTypeId" text NOT NULL REFERENCES app_quikcrm."CrmActivityType"(id) ON DELETE CASCADE,
  key              text NOT NULL,
  label            text NOT NULL,
  "fieldType"      text NOT NULL,
  requirement      text NOT NULL DEFAULT 'Optional',
  options          jsonb,
  visible          boolean NOT NULL DEFAULT true,
  "helpText"       text,
  "sortOrder"      integer NOT NULL DEFAULT 0,
  "createdAt"      timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"      timestamp(3) NOT NULL
);

-- @@unique([activityTypeId, key])
CREATE UNIQUE INDEX IF NOT EXISTS "CrmActivityFieldDefinition_activityTypeId_key_key"
  ON app_quikcrm."CrmActivityFieldDefinition" ("activityTypeId", "key");
-- @@index([orgId])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldDefinition_orgId_idx"
  ON app_quikcrm."CrmActivityFieldDefinition" ("orgId");
-- @@index([activityTypeId])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldDefinition_activityTypeId_idx"
  ON app_quikcrm."CrmActivityFieldDefinition" ("activityTypeId");

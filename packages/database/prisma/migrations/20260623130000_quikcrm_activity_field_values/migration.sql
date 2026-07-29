-- QuikCRM: Activity custom-field VALUES — indexed, queryable storage (Phase 2).
-- Decision #1: a dedicated table with TYPED columns (NOT a JSON blob) so the
-- Phase-4 dashboard and digests can aggregate/filter BY custom-field value
-- (count, sum, group-by) using the per-value indexes below. One row per
-- (activity, field definition). Mirrors QuikTrack's QtIssueFieldValue.
-- See apps/quikcrm/ACTIVITY-FEATURE-DECISIONS.md.
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) so it is safe to apply by hand;
-- the build pipeline does not run `migrate deploy`. Index/constraint names match
-- Prisma's generated names for @@unique / @@index so the client stays in sync.
-- Depends on the P1 migration (CrmActivity, CrmActivityFieldDefinition) being
-- applied first.

CREATE TABLE IF NOT EXISTS app_quikcrm."CrmActivityFieldValue" (
  id                  text PRIMARY KEY,
  "orgId"             text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "activityId"        text NOT NULL REFERENCES app_quikcrm."CrmActivity"(id) ON DELETE CASCADE,
  "fieldDefinitionId" text NOT NULL REFERENCES app_quikcrm."CrmActivityFieldDefinition"(id) ON DELETE CASCADE,
  "fieldKey"          text NOT NULL,
  "valueText"         text,
  "valueNumber"       double precision,
  "valueDate"         timestamp(3),
  "valueBoolean"      boolean,
  "valueJson"         jsonb,
  "createdAt"         timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"         timestamp(3) NOT NULL
);

-- @@unique([activityId, fieldDefinitionId]) — one value row per field per activity
CREATE UNIQUE INDEX IF NOT EXISTS "CrmActivityFieldValue_activityId_fieldDefinitionId_key"
  ON app_quikcrm."CrmActivityFieldValue" ("activityId", "fieldDefinitionId");

-- @@index([orgId])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldValue_orgId_idx"
  ON app_quikcrm."CrmActivityFieldValue" ("orgId");
-- @@index([activityId])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldValue_activityId_idx"
  ON app_quikcrm."CrmActivityFieldValue" ("activityId");

-- Per-value indexes — the point of decision #1: cheap aggregate/filter BY value.
-- @@index([fieldDefinitionId, valueText])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldValue_fieldDefinitionId_valueText_idx"
  ON app_quikcrm."CrmActivityFieldValue" ("fieldDefinitionId", "valueText");
-- @@index([fieldDefinitionId, valueNumber])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldValue_fieldDefinitionId_valueNumber_idx"
  ON app_quikcrm."CrmActivityFieldValue" ("fieldDefinitionId", "valueNumber");
-- @@index([fieldDefinitionId, valueDate])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldValue_fieldDefinitionId_valueDate_idx"
  ON app_quikcrm."CrmActivityFieldValue" ("fieldDefinitionId", "valueDate");
-- @@index([fieldDefinitionId, valueBoolean])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldValue_fieldDefinitionId_valueBoolean_idx"
  ON app_quikcrm."CrmActivityFieldValue" ("fieldDefinitionId", "valueBoolean");

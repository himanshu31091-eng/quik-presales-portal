-- QuikTrack: Customer Fields (Custom Fields) — FRD "Customer Fields" v2.
-- Two-tier scope: scope="global" (org-wide, projectId NULL) or scope="space"
-- (one project). Values live in QtIssueFieldValue with typed columns so the
-- backlog filter can index by value. Idempotent so it is safe to apply to the
-- shared prod Neon DB by hand (the build pipeline does not run `migrate deploy`).

-- ── Field definitions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtCustomField" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  scope          text NOT NULL DEFAULT 'space',
  "projectId"    text REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE,
  name           text NOT NULL,
  key            text NOT NULL,
  type           text NOT NULL,
  description    text,
  status         text NOT NULL DEFAULT 'active',
  "isRequired"   boolean NOT NULL DEFAULT false,
  "defaultValue" jsonb,
  placeholder    text,
  "helpText"     text,
  position       integer NOT NULL DEFAULT 0,
  "isDeleted"    boolean NOT NULL DEFAULT false,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"    timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"    text,
  "updatedBy"    text
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtCustomField_projectId_key_key"
  ON app_quiktrack."QtCustomField" ("projectId", "key");
CREATE INDEX IF NOT EXISTS "QtCustomField_orgId_scope_status_idx"
  ON app_quiktrack."QtCustomField" ("orgId", "scope", "status");
CREATE INDEX IF NOT EXISTS "QtCustomField_projectId_status_idx"
  ON app_quiktrack."QtCustomField" ("projectId", "status");

-- ── Dropdown options ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtCustomFieldOption" (
  id          text PRIMARY KEY,
  "fieldId"   text NOT NULL REFERENCES app_quiktrack."QtCustomField"(id) ON DELETE CASCADE,
  label       text NOT NULL,
  value       text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  "isActive"  boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "QtCustomFieldOption_fieldId_isActive_idx"
  ON app_quiktrack."QtCustomFieldOption" ("fieldId", "isActive");

-- ── Per-issue typed values ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIssueFieldValue" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "issueId"      text NOT NULL REFERENCES app_quiktrack."QtIssue"(id) ON DELETE CASCADE,
  "fieldId"      text NOT NULL REFERENCES app_quiktrack."QtCustomField"(id) ON DELETE CASCADE,
  "valueText"    text,
  "valueNumber"  double precision,
  "valueDate"    timestamp(3),
  "valueBoolean" boolean,
  "valueJson"    jsonb,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"    timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"    text,
  "updatedBy"    text
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtIssueFieldValue_issueId_fieldId_key"
  ON app_quiktrack."QtIssueFieldValue" ("issueId", "fieldId");
CREATE INDEX IF NOT EXISTS "QtIssueFieldValue_fieldId_valueText_idx"
  ON app_quiktrack."QtIssueFieldValue" ("fieldId", "valueText");
CREATE INDEX IF NOT EXISTS "QtIssueFieldValue_fieldId_valueNumber_idx"
  ON app_quiktrack."QtIssueFieldValue" ("fieldId", "valueNumber");
CREATE INDEX IF NOT EXISTS "QtIssueFieldValue_fieldId_valueDate_idx"
  ON app_quiktrack."QtIssueFieldValue" ("fieldId", "valueDate");
CREATE INDEX IF NOT EXISTS "QtIssueFieldValue_fieldId_valueBoolean_idx"
  ON app_quiktrack."QtIssueFieldValue" ("fieldId", "valueBoolean");
CREATE INDEX IF NOT EXISTS "QtIssueFieldValue_orgId_idx"
  ON app_quiktrack."QtIssueFieldValue" ("orgId");

-- ── Audit log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtCustomFieldAudit" (
  id           text PRIMARY KEY,
  "orgId"      text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "fieldId"    text REFERENCES app_quiktrack."QtCustomField"(id) ON DELETE SET NULL,
  action       text NOT NULL,
  "actorId"    text,
  "oldValue"   jsonb,
  "newValue"   jsonb,
  "occurredAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "QtCustomFieldAudit_orgId_occurredAt_idx"
  ON app_quiktrack."QtCustomFieldAudit" ("orgId", "occurredAt");
CREATE INDEX IF NOT EXISTS "QtCustomFieldAudit_fieldId_idx"
  ON app_quiktrack."QtCustomFieldAudit" ("fieldId");

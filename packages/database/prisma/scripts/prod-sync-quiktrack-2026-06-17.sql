-- ============================================================================
-- QuikTrack prod sync - brings a DB matching the older schema up to current.
-- Covers: Doc folders, Doc share, Custom Fields cluster, ReportView, Feedback.
-- Fully idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) - safe to run
-- against the shared Neon DB by hand; the build pipeline does not run
-- `migrate deploy`. Re-running is a no-op. Wrap in a transaction.
--
-- Verified 1:1 against packages/database/prisma/schema.prisma on 2026-06-18
-- (QtDoc additions, QtDocFolder, QtCustomField, QtCustomFieldOption,
--  QtIssueFieldValue, QtCustomFieldAudit, QtReportView, QtFeedback).
--
-- NOTE: this only syncs the DATABASE. The runtime "Cannot read properties of
-- undefined (reading 'findMany')" error is a STALE PRISMA CLIENT, fixed by
-- `prisma generate` (runs automatically in the prod Docker build). This SQL
-- does not regenerate the client.
-- ============================================================================
BEGIN;

-- -- 1. Docs: folders (migration 20260608120000) ------------------------------
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

ALTER TABLE app_quiktrack."QtDoc" ADD COLUMN IF NOT EXISTS "folderId"  text;
ALTER TABLE app_quiktrack."QtDoc" ADD COLUMN IF NOT EXISTS "sortOrder" integer NOT NULL DEFAULT 0;

-- -- 2. Docs: public share links (migration 20260608130000) --------------------
ALTER TABLE app_quiktrack."QtDoc" ADD COLUMN IF NOT EXISTS "shareToken" text;
ALTER TABLE app_quiktrack."QtDoc" ADD COLUMN IF NOT EXISTS "shareMode"  text;
CREATE UNIQUE INDEX IF NOT EXISTS "QtDoc_shareToken_key"
  ON app_quiktrack."QtDoc" ("shareToken");

-- -- 3. Custom Fields cluster (migration 20260611120000) -----------------------
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

-- -- 4. Executive report saved views (no prior migration) ----------------------
CREATE TABLE IF NOT EXISTS app_quiktrack."QtReportView" (
  id            text PRIMARY KEY,
  "orgId"       text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "userId"      text NOT NULL,
  kind          text NOT NULL DEFAULT 'executive',
  name          text NOT NULL,
  "filtersJson" jsonb NOT NULL,
  "isPinned"    boolean NOT NULL DEFAULT false,
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QtReportView_orgId_userId_kind_idx"
  ON app_quiktrack."QtReportView" ("orgId", "userId", "kind");

-- -- 5. In-app feedback (no prior migration; no FK per schema) -----------------
CREATE TABLE IF NOT EXISTS app_quiktrack."QtFeedback" (
  id           text PRIMARY KEY,
  "orgId"      text NOT NULL,
  "userId"     text NOT NULL,
  "projectId"  text,
  category     text NOT NULL,
  content      text NOT NULL,
  "contactOk"  boolean NOT NULL DEFAULT false,
  "researchOk" boolean NOT NULL DEFAULT false,
  url          text,
  "userAgent"  text,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QtFeedback_orgId_createdAt_idx"
  ON app_quiktrack."QtFeedback" ("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "QtFeedback_userId_idx"
  ON app_quiktrack."QtFeedback" ("userId");

COMMIT;

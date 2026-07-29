-- QuikTrack issue attachments — first-class binary attachments stored in S3.
-- Mirrors the QtIssueAttachment model in packages/database/prisma/schema.prisma.
-- Initial consumer: the Jira → QuikTrack importer (migrate-jira.ts).

CREATE TABLE app_quiktrack."QtIssueAttachment" (
  id                   TEXT PRIMARY KEY,
  "orgId"              TEXT NOT NULL,
  "projectId"          TEXT NOT NULL,
  "issueId"            TEXT NOT NULL,
  "fileName"           TEXT NOT NULL,
  "mimeType"           TEXT NOT NULL,
  "sizeBytes"          INTEGER NOT NULL,
  "s3Key"              TEXT NOT NULL,
  "sourceSystem"       TEXT,
  "sourceAttachmentId" TEXT,
  "uploadedBy"         TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QtIssueAttachment_issue_fkey"
    FOREIGN KEY ("issueId")
    REFERENCES app_quiktrack."QtIssue"(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- Natural idempotency key for importers: re-running won't insert a duplicate
-- row for the same source attachment on the same issue. NULLs in Postgres
-- are distinct, so locally-uploaded rows (where sourceSystem/Id are null)
-- aren't constrained by this index.
CREATE UNIQUE INDEX "QtIssueAttachment_issue_source_key"
  ON app_quiktrack."QtIssueAttachment"("issueId", "sourceSystem", "sourceAttachmentId");

CREATE INDEX "QtIssueAttachment_org_idx"
  ON app_quiktrack."QtIssueAttachment"("orgId");
CREATE INDEX "QtIssueAttachment_project_idx"
  ON app_quiktrack."QtIssueAttachment"("projectId");
CREATE INDEX "QtIssueAttachment_issue_created_idx"
  ON app_quiktrack."QtIssueAttachment"("issueId", "createdAt");

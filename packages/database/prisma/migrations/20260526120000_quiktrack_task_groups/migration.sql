-- QuikTrack Grouped Kanban — adds QtTaskGroup table and the
-- groupId / orderInGroup columns on QtIssue. Mirrors the QtTaskGroup model
-- and the QtIssue additions in packages/database/prisma/schema.prisma.

CREATE TABLE app_quiktrack."QtTaskGroup" (
  id            TEXT PRIMARY KEY,
  "orgId"       TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#94a3b8',
  icon          TEXT,
  "order"       INTEGER NOT NULL DEFAULT 0,
  "isDefault"   BOOLEAN NOT NULL DEFAULT FALSE,
  "isCollapsed" BOOLEAN NOT NULL DEFAULT FALSE,
  "isDeleted"   BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "createdBy"   TEXT,
  "updatedBy"   TEXT,
  CONSTRAINT "QtTaskGroup_project_fkey"
    FOREIGN KEY ("projectId")
    REFERENCES app_quiktrack."QtProject"(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QtTaskGroup_project_name_key"
  ON app_quiktrack."QtTaskGroup"("projectId", name);
CREATE INDEX "QtTaskGroup_org_project_idx"
  ON app_quiktrack."QtTaskGroup"("orgId", "projectId");
CREATE INDEX "QtTaskGroup_project_order_idx"
  ON app_quiktrack."QtTaskGroup"("projectId", "order");

ALTER TABLE app_quiktrack."QtIssue"
  ADD COLUMN "groupId"      TEXT,
  ADD COLUMN "orderInGroup" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE app_quiktrack."QtIssue"
  ADD CONSTRAINT "QtIssue_group_fkey"
    FOREIGN KEY ("groupId")
    REFERENCES app_quiktrack."QtTaskGroup"(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

CREATE INDEX "QtIssue_group_order_idx"
  ON app_quiktrack."QtIssue"("groupId", "orderInGroup");

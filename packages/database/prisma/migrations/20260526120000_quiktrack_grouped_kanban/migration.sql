-- QuikTrack Grouped Kanban — adds business-band grouping that sits
-- alongside QtIssue.statusId as an independent axis. See
-- apps/quiktrack/lib/services/groupService.ts for the "group ≠ status"
-- invariant enforcement (DB does not enforce this).

-- 1. Create QtTaskGroup table
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
  CONSTRAINT "QtTaskGroup_project_fk"
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

-- 2. Add groupId + orderInGroup columns to QtIssue
ALTER TABLE app_quiktrack."QtIssue"
  ADD COLUMN "groupId"      TEXT,
  ADD COLUMN "orderInGroup" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE app_quiktrack."QtIssue"
  ADD CONSTRAINT "QtIssue_group_fk"
    FOREIGN KEY ("groupId")
    REFERENCES app_quiktrack."QtTaskGroup"(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

CREATE INDEX "QtIssue_group_order_idx"
  ON app_quiktrack."QtIssue"("groupId", "orderInGroup");

-- 3. Seed a default "Ungrouped" QtTaskGroup row for every existing project
-- so the Grouped Kanban board never renders empty. Idempotent: skips
-- projects that already have an isDefault=true group.
--
-- ID format: 'cgrp_' + 20 hex chars derived from project id. Deterministic
-- so re-running this migration produces the same id (safe on rollback /
-- re-apply scenarios). gen_random_uuid() left out to avoid pgcrypto
-- extension assumption.
INSERT INTO app_quiktrack."QtTaskGroup"
  (id, "orgId", "projectId", name, color, "order", "isDefault", "isCollapsed", "isDeleted", "createdAt", "updatedAt")
SELECT
  'cgrp_' || substr(md5(p.id || '_default'), 1, 20),
  p."orgId",
  p.id,
  'Ungrouped',
  '#94a3b8',
  0,
  TRUE,
  FALSE,
  FALSE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM app_quiktrack."QtProject" p
WHERE NOT EXISTS (
  SELECT 1
  FROM app_quiktrack."QtTaskGroup" g
  WHERE g."projectId" = p.id
    AND g."isDefault" = TRUE
);

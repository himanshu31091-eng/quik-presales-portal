-- QuikTrack project-scoped dynamic roles (Jira-style RBAC layer 2).
-- Adds three new tables in app_quiktrack:
--   QtProjectRole              — role catalogue scoped to a project
--   QtProjectRolePermission    — (resource, action) grants per project role
--   QtProjectRoleNavigation    — sidebar visibility per project role
-- and one nullable FK column on QtProjectMember:
--   projectRoleId              — optional FK to QtProjectRole.id (legacy `role` string column preserved)

-- ──────────────────── QtProjectRole ────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtProjectRole" (
    id          TEXT PRIMARY KEY,
    "orgId"     TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtProjectRole_projectId_name_key"
    ON app_quiktrack."QtProjectRole"("projectId", name);
CREATE INDEX IF NOT EXISTS "QtProjectRole_orgId_idx"
    ON app_quiktrack."QtProjectRole"("orgId");
CREATE INDEX IF NOT EXISTS "QtProjectRole_projectId_idx"
    ON app_quiktrack."QtProjectRole"("projectId");

ALTER TABLE app_quiktrack."QtProjectRole"
    ADD CONSTRAINT "QtProjectRole_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE app_quiktrack."QtProjectRole"
    ADD CONSTRAINT "QtProjectRole_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────── QtProjectRolePermission ────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtProjectRolePermission" (
    id       TEXT PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    resource TEXT NOT NULL,
    action   TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtProjectRolePermission_roleId_resource_action_key"
    ON app_quiktrack."QtProjectRolePermission"("roleId", resource, action);
CREATE INDEX IF NOT EXISTS "QtProjectRolePermission_roleId_idx"
    ON app_quiktrack."QtProjectRolePermission"("roleId");

ALTER TABLE app_quiktrack."QtProjectRolePermission"
    ADD CONSTRAINT "QtProjectRolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES app_quiktrack."QtProjectRole"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────── QtProjectRoleNavigation ────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtProjectRoleNavigation" (
    id       TEXT PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    "navKey" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtProjectRoleNavigation_roleId_navKey_key"
    ON app_quiktrack."QtProjectRoleNavigation"("roleId", "navKey");
CREATE INDEX IF NOT EXISTS "QtProjectRoleNavigation_roleId_idx"
    ON app_quiktrack."QtProjectRoleNavigation"("roleId");

ALTER TABLE app_quiktrack."QtProjectRoleNavigation"
    ADD CONSTRAINT "QtProjectRoleNavigation_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES app_quiktrack."QtProjectRole"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────── QtProjectMember.projectRoleId ────────────────────
ALTER TABLE app_quiktrack."QtProjectMember"
    ADD COLUMN IF NOT EXISTS "projectRoleId" TEXT;

CREATE INDEX IF NOT EXISTS "QtProjectMember_projectRoleId_idx"
    ON app_quiktrack."QtProjectMember"("projectRoleId");

ALTER TABLE app_quiktrack."QtProjectMember"
    ADD CONSTRAINT "QtProjectMember_projectRoleId_fkey"
    FOREIGN KEY ("projectRoleId") REFERENCES app_quiktrack."QtProjectRole"(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

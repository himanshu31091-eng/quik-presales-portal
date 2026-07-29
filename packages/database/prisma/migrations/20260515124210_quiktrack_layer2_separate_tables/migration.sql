-- Schema rule: no new columns on existing tables. Roll back the three
-- polymorphic columns we previously added and replace with three dedicated
-- tables for the Layer-2 (project-role) layer.

-- ──────────────── Drop polymorphic columns ────────────────

-- QtRolePermission: revert to roleId-only
ALTER TABLE app_quiktrack."RolePermission"
    DROP CONSTRAINT IF EXISTS "RolePermission_projectRoleId_fkey";
DROP INDEX IF EXISTS app_quiktrack."RolePermission_projectRoleId_idx";
DROP INDEX IF EXISTS app_quiktrack."RolePermission_projectRoleId_resource_action_key";
ALTER TABLE app_quiktrack."RolePermission"
    DROP COLUMN IF EXISTS "projectRoleId";
ALTER TABLE app_quiktrack."RolePermission"
    ALTER COLUMN "roleId" SET NOT NULL;

-- QtRoleNavigation: revert to roleId-only
ALTER TABLE app_quiktrack."RoleNavigation"
    DROP CONSTRAINT IF EXISTS "RoleNavigation_projectRoleId_fkey";
DROP INDEX IF EXISTS app_quiktrack."RoleNavigation_projectRoleId_idx";
DROP INDEX IF EXISTS app_quiktrack."RoleNavigation_projectRoleId_navKey_key";
ALTER TABLE app_quiktrack."RoleNavigation"
    DROP COLUMN IF EXISTS "projectRoleId";
ALTER TABLE app_quiktrack."RoleNavigation"
    ALTER COLUMN "roleId" SET NOT NULL;

-- QtProjectMember: drop projectRoleId (moved to QtProjectUserRole)
ALTER TABLE app_quiktrack."QtProjectMember"
    DROP CONSTRAINT IF EXISTS "QtProjectMember_projectRoleId_fkey";
DROP INDEX IF EXISTS app_quiktrack."QtProjectMember_projectRoleId_idx";
ALTER TABLE app_quiktrack."QtProjectMember"
    DROP COLUMN IF EXISTS "projectRoleId";

-- ──────────────── QtProjectRolePermission ────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtProjectRolePermission" (
    id              TEXT PRIMARY KEY,
    "projectRoleId" TEXT NOT NULL,
    resource        TEXT NOT NULL,
    action          TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtProjectRolePermission_projectRoleId_resource_action_key"
    ON app_quiktrack."QtProjectRolePermission"("projectRoleId", resource, action);
CREATE INDEX IF NOT EXISTS "QtProjectRolePermission_projectRoleId_idx"
    ON app_quiktrack."QtProjectRolePermission"("projectRoleId");

ALTER TABLE app_quiktrack."QtProjectRolePermission"
    ADD CONSTRAINT "QtProjectRolePermission_projectRoleId_fkey"
    FOREIGN KEY ("projectRoleId") REFERENCES app_quiktrack."QtProjectRole"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────── QtProjectRoleNavigation ────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtProjectRoleNavigation" (
    id              TEXT PRIMARY KEY,
    "projectRoleId" TEXT NOT NULL,
    "navKey"        TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtProjectRoleNavigation_projectRoleId_navKey_key"
    ON app_quiktrack."QtProjectRoleNavigation"("projectRoleId", "navKey");
CREATE INDEX IF NOT EXISTS "QtProjectRoleNavigation_projectRoleId_idx"
    ON app_quiktrack."QtProjectRoleNavigation"("projectRoleId");

ALTER TABLE app_quiktrack."QtProjectRoleNavigation"
    ADD CONSTRAINT "QtProjectRoleNavigation_projectRoleId_fkey"
    FOREIGN KEY ("projectRoleId") REFERENCES app_quiktrack."QtProjectRole"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────── QtProjectUserRole ────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtProjectUserRole" (
    id              TEXT PRIMARY KEY,
    "projectId"     TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "projectRoleId" TEXT NOT NULL,
    "assignedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy"    TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtProjectUserRole_projectId_userId_key"
    ON app_quiktrack."QtProjectUserRole"("projectId", "userId");
CREATE INDEX IF NOT EXISTS "QtProjectUserRole_userId_projectId_idx"
    ON app_quiktrack."QtProjectUserRole"("userId", "projectId");
CREATE INDEX IF NOT EXISTS "QtProjectUserRole_projectRoleId_idx"
    ON app_quiktrack."QtProjectUserRole"("projectRoleId");

ALTER TABLE app_quiktrack."QtProjectUserRole"
    ADD CONSTRAINT "QtProjectUserRole_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE app_quiktrack."QtProjectUserRole"
    ADD CONSTRAINT "QtProjectUserRole_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES auth."User"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE app_quiktrack."QtProjectUserRole"
    ADD CONSTRAINT "QtProjectUserRole_projectRoleId_fkey"
    FOREIGN KEY ("projectRoleId") REFERENCES app_quiktrack."QtProjectRole"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

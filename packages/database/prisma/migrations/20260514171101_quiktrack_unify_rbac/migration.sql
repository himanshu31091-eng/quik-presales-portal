-- Unify QuikTrack RBAC: project roles share the same RolePermission /
-- RoleNavigation tables as app roles. A rule row points to EITHER roleId
-- (QtAppRole) OR projectRoleId (QtProjectRole) — never both.
--
-- The two duplicate per-project rule tables from the previous migration
-- (QtProjectRolePermission / QtProjectRoleNavigation) are dropped — the
-- DROP at the top is idempotent so re-running this migration is safe even
-- when they were already dropped.
--
-- Also creates the missing app_quiktrack RBAC tables that are mapped from
-- the Qt-prefixed Prisma models (AppRole, UserAppRole, RolePermission,
-- RoleNavigation, UserPermissionExtra). These were declared in Prisma but
-- never existed in the live DB.

-- ──────────────── DROP the duplicate per-project rule tables ────────────────
DROP TABLE IF EXISTS app_quiktrack."QtProjectRolePermission";
DROP TABLE IF EXISTS app_quiktrack."QtProjectRoleNavigation";

-- ──────────────── AppRole ────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."AppRole" (
    id          TEXT PRIMARY KEY,
    "orgId"     TEXT NOT NULL,
    "appId"     TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    "isSystem"  BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppRole_orgId_appId_name_key"
    ON app_quiktrack."AppRole"("orgId", "appId", name);
CREATE INDEX IF NOT EXISTS "AppRole_orgId_appId_idx"
    ON app_quiktrack."AppRole"("orgId", "appId");

ALTER TABLE app_quiktrack."AppRole"
    ADD CONSTRAINT "AppRole_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE app_quiktrack."AppRole"
    ADD CONSTRAINT "AppRole_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES quikit."App"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────── UserAppRole ────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."UserAppRole" (
    id           TEXT PRIMARY KEY,
    "userId"     TEXT NOT NULL,
    "orgId"      TEXT NOT NULL,
    "roleId"     TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_roleId_key"
    ON app_quiktrack."UserAppRole"("userId", "orgId", "roleId");
CREATE INDEX IF NOT EXISTS "UserAppRole_roleId_idx"
    ON app_quiktrack."UserAppRole"("roleId");
CREATE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_idx"
    ON app_quiktrack."UserAppRole"("userId", "orgId");

ALTER TABLE app_quiktrack."UserAppRole"
    ADD CONSTRAINT "UserAppRole_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES auth."User"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE app_quiktrack."UserAppRole"
    ADD CONSTRAINT "UserAppRole_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE app_quiktrack."UserAppRole"
    ADD CONSTRAINT "UserAppRole_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES app_quiktrack."AppRole"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────── RolePermission (unified for both AppRole and QtProjectRole) ────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."RolePermission" (
    id              TEXT PRIMARY KEY,
    "roleId"        TEXT,
    "projectRoleId" TEXT,
    resource        TEXT NOT NULL,
    action          TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_resource_action_key"
    ON app_quiktrack."RolePermission"("roleId", resource, action);
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_projectRoleId_resource_action_key"
    ON app_quiktrack."RolePermission"("projectRoleId", resource, action);
CREATE INDEX IF NOT EXISTS "RolePermission_roleId_idx"
    ON app_quiktrack."RolePermission"("roleId");
CREATE INDEX IF NOT EXISTS "RolePermission_projectRoleId_idx"
    ON app_quiktrack."RolePermission"("projectRoleId");

ALTER TABLE app_quiktrack."RolePermission"
    ADD CONSTRAINT "RolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES app_quiktrack."AppRole"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE app_quiktrack."RolePermission"
    ADD CONSTRAINT "RolePermission_projectRoleId_fkey"
    FOREIGN KEY ("projectRoleId") REFERENCES app_quiktrack."QtProjectRole"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────── RoleNavigation (unified) ────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."RoleNavigation" (
    id              TEXT PRIMARY KEY,
    "roleId"        TEXT,
    "projectRoleId" TEXT,
    "navKey"        TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "RoleNavigation_roleId_navKey_key"
    ON app_quiktrack."RoleNavigation"("roleId", "navKey");
CREATE UNIQUE INDEX IF NOT EXISTS "RoleNavigation_projectRoleId_navKey_key"
    ON app_quiktrack."RoleNavigation"("projectRoleId", "navKey");
CREATE INDEX IF NOT EXISTS "RoleNavigation_roleId_idx"
    ON app_quiktrack."RoleNavigation"("roleId");
CREATE INDEX IF NOT EXISTS "RoleNavigation_projectRoleId_idx"
    ON app_quiktrack."RoleNavigation"("projectRoleId");

ALTER TABLE app_quiktrack."RoleNavigation"
    ADD CONSTRAINT "RoleNavigation_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES app_quiktrack."AppRole"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE app_quiktrack."RoleNavigation"
    ADD CONSTRAINT "RoleNavigation_projectRoleId_fkey"
    FOREIGN KEY ("projectRoleId") REFERENCES app_quiktrack."QtProjectRole"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────── UserPermissionExtra ────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."UserPermissionExtra" (
    id          TEXT PRIMARY KEY,
    "orgId"     TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    resource    TEXT NOT NULL,
    action      TEXT NOT NULL,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserPermissionExtra_orgId_userId_resource_action_key"
    ON app_quiktrack."UserPermissionExtra"("orgId", "userId", resource, action);
CREATE INDEX IF NOT EXISTS "UserPermissionExtra_userId_orgId_idx"
    ON app_quiktrack."UserPermissionExtra"("userId", "orgId");

ALTER TABLE app_quiktrack."UserPermissionExtra"
    ADD CONSTRAINT "UserPermissionExtra_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE app_quiktrack."UserPermissionExtra"
    ADD CONSTRAINT "UserPermissionExtra_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES auth."User"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

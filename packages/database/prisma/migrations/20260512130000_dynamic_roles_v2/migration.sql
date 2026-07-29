-- Dynamic Roles & Permissions v2
--
-- Adds the 4 role tables that DB already had but Prisma schema lacked,
-- plus a NEW UserPermissionExtra table for per-user additive grants.
--
-- All CREATE TABLE statements use IF NOT EXISTS so this migration is safe
-- to run on:
--   • Fresh DBs (creates all 5 tables)
--   • DBs that already have the 4 legacy tables (creates only
--     UserPermissionExtra; pre-existing rows preserved).
--
-- See apps/quikscale/rolesAndPermissions.md + rolesAndPermissions-AppRole.md.

CREATE TABLE IF NOT EXISTS "app_quikscale"."AppRole" (
    "id"          TEXT NOT NULL,
    "orgId"       TEXT NOT NULL,
    "appId"       TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "isSystem"    BOOLEAN NOT NULL DEFAULT false,
    "isDefault"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    "createdBy"   TEXT,
    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppRole_orgId_appId_name_key"
  ON "app_quikscale"."AppRole" ("orgId", "appId", "name");
CREATE INDEX IF NOT EXISTS "AppRole_orgId_appId_idx"
  ON "app_quikscale"."AppRole" ("orgId", "appId");

CREATE TABLE IF NOT EXISTS "app_quikscale"."UserAppRole" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "orgId"      TEXT NOT NULL,
    "roleId"     TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    CONSTRAINT "UserAppRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_roleId_key"
  ON "app_quikscale"."UserAppRole" ("userId", "orgId", "roleId");
CREATE INDEX IF NOT EXISTS "UserAppRole_roleId_idx"
  ON "app_quikscale"."UserAppRole" ("roleId");
CREATE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_idx"
  ON "app_quikscale"."UserAppRole" ("userId", "orgId");

CREATE TABLE IF NOT EXISTS "app_quikscale"."RolePermission" (
    "id"       TEXT NOT NULL,
    "roleId"   TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action"   TEXT NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_resource_action_key"
  ON "app_quikscale"."RolePermission" ("roleId", "resource", "action");
CREATE INDEX IF NOT EXISTS "RolePermission_roleId_idx"
  ON "app_quikscale"."RolePermission" ("roleId");

CREATE TABLE IF NOT EXISTS "app_quikscale"."RoleNavigation" (
    "id"     TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "navKey" TEXT NOT NULL,
    CONSTRAINT "RoleNavigation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RoleNavigation_roleId_navKey_key"
  ON "app_quikscale"."RoleNavigation" ("roleId", "navKey");
CREATE INDEX IF NOT EXISTS "RoleNavigation_roleId_idx"
  ON "app_quikscale"."RoleNavigation" ("roleId");

CREATE TABLE IF NOT EXISTS "app_quikscale"."UserPermissionExtra" (
    "id"        TEXT NOT NULL,
    "orgId"     TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "resource"  TEXT NOT NULL,
    "action"    TEXT NOT NULL,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPermissionExtra_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserPermissionExtra_orgId_userId_resource_action_key"
  ON "app_quikscale"."UserPermissionExtra" ("orgId", "userId", "resource", "action");
CREATE INDEX IF NOT EXISTS "UserPermissionExtra_userId_orgId_idx"
  ON "app_quikscale"."UserPermissionExtra" ("userId", "orgId");

-- Foreign keys — wrapped in DO blocks so re-runs against partially-migrated
-- DBs don't error on duplicate constraint names.
DO $$ BEGIN
  ALTER TABLE "app_quikscale"."AppRole"
    ADD CONSTRAINT "AppRole_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikscale"."AppRole"
    ADD CONSTRAINT "AppRole_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "quikit"."App"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikscale"."UserAppRole"
    ADD CONSTRAINT "UserAppRole_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "app_quikscale"."AppRole"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikscale"."UserAppRole"
    ADD CONSTRAINT "UserAppRole_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "auth"."User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikscale"."UserAppRole"
    ADD CONSTRAINT "UserAppRole_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikscale"."RolePermission"
    ADD CONSTRAINT "RolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "app_quikscale"."AppRole"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikscale"."RoleNavigation"
    ADD CONSTRAINT "RoleNavigation_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "app_quikscale"."AppRole"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikscale"."UserPermissionExtra"
    ADD CONSTRAINT "UserPermissionExtra_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikscale"."UserPermissionExtra"
    ADD CONSTRAINT "UserPermissionExtra_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "auth"."User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

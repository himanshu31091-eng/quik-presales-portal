-- QuikLMS: add the per-app RBAC tables the app was missing entirely.
--
-- WHY: every other product app carries the same five-table shape (AppRole +
-- RolePermission + RoleNavigation + UserAppRole + UserPermissionExtra) in its
-- own Postgres schema — see app_quikhrms for the reference implementation.
-- QuikLMS had none of them. Authorization was a hardcoded `LmsUserRole` enum on
-- app_quiklms.users.role, which meant:
--   * a tenant could not define a custom role, or grant/deny a single
--     permission, or time-box an assignment;
--   * `assignAppRoles()` in packages/auth had no tables to write into, so a
--     central invitation carrying `inviteAppIds` could never seed an LMS role,
--     and `mirrorAppRoleToCentral()` never ran — quikit.UserAppAccess.role and
--     the effective LMS role could silently disagree.
--
-- SAFETY: purely additive. Creates one enum type and five new tables in the
-- app_quiklms schema; touches no existing table, column, row or constraint.
-- The coarse `users.role` enum is deliberately left in place and still drives
-- authorization — ~335 files read it through `getAuthContext`. Nothing reads
-- these tables yet, so this migration is safe to apply before, during or after
-- the code deploy, and safe to apply to a database that never adopts them.
--
-- The one foreign key that leaves this family points at app_quiklms.users,
-- which is inside the same schema. No cross-schema FK is created: `orgId` and
-- `appId` remain scalars referencing quikit.Org / quikit.App by value, matching
-- how every other Lms* table in this schema stores them.

-- CreateEnum
CREATE TYPE "app_quiklms"."LmsPermissionGrantKind" AS ENUM ('GRANT', 'DENY');

-- CreateTable
CREATE TABLE "app_quiklms"."AppRole" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quiklms"."RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quiklms"."RoleNavigation" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "navKey" TEXT NOT NULL,

    CONSTRAINT "RoleNavigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quiklms"."UserAppRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "UserAppRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quiklms"."UserPermissionExtra" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "kind" "app_quiklms"."LmsPermissionGrantKind" NOT NULL DEFAULT 'GRANT',
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppRole_orgId_appId_idx" ON "app_quiklms"."AppRole"("orgId", "appId");

-- CreateIndex
CREATE UNIQUE INDEX "AppRole_orgId_appId_name_key" ON "app_quiklms"."AppRole"("orgId", "appId", "name");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "app_quiklms"."RolePermission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_resource_action_key" ON "app_quiklms"."RolePermission"("roleId", "resource", "action");

-- CreateIndex
CREATE INDEX "RoleNavigation_roleId_idx" ON "app_quiklms"."RoleNavigation"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleNavigation_roleId_navKey_key" ON "app_quiklms"."RoleNavigation"("roleId", "navKey");

-- CreateIndex
CREATE INDEX "UserAppRole_roleId_idx" ON "app_quiklms"."UserAppRole"("roleId");

-- CreateIndex
CREATE INDEX "UserAppRole_userId_orgId_idx" ON "app_quiklms"."UserAppRole"("userId", "orgId");

-- CreateIndex
CREATE INDEX "UserAppRole_expiresAt_idx" ON "app_quiklms"."UserAppRole"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserAppRole_userId_orgId_roleId_key" ON "app_quiklms"."UserAppRole"("userId", "orgId", "roleId");

-- CreateIndex
CREATE INDEX "UserPermissionExtra_userId_orgId_idx" ON "app_quiklms"."UserPermissionExtra"("userId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionExtra_orgId_userId_resource_action_key" ON "app_quiklms"."UserPermissionExtra"("orgId", "userId", "resource", "action");

-- AddForeignKey
ALTER TABLE "app_quiklms"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quiklms"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quiklms"."RoleNavigation" ADD CONSTRAINT "RoleNavigation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quiklms"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quiklms"."UserAppRole" ADD CONSTRAINT "UserAppRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quiklms"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quiklms"."UserAppRole" ADD CONSTRAINT "UserAppRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_quiklms"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quiklms"."UserPermissionExtra" ADD CONSTRAINT "UserPermissionExtra_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_quiklms"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

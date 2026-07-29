-- QuikSocial RBAC v2: org-scoped roles/permissions tables in app_quiksocial.
-- Mirrors app_quikscale's AppRole / UserAppRole / RolePermission / RoleNavigation
-- (Prisma models QsAppRole / QsUserAppRole / QsRolePermission / QsRoleNavigation,
-- which already exist in schema.prisma via @@map + @@schema("app_quiksocial")).

-- CreateTable
CREATE TABLE "app_quiksocial"."AppRole" (
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
CREATE TABLE "app_quiksocial"."UserAppRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    CONSTRAINT "UserAppRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quiksocial"."RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quiksocial"."RoleNavigation" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "navKey" TEXT NOT NULL,
    CONSTRAINT "RoleNavigation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppRole_orgId_appId_idx" ON "app_quiksocial"."AppRole"("orgId", "appId");
CREATE UNIQUE INDEX "AppRole_orgId_appId_name_key" ON "app_quiksocial"."AppRole"("orgId", "appId", "name");
CREATE INDEX "UserAppRole_roleId_idx" ON "app_quiksocial"."UserAppRole"("roleId");
CREATE INDEX "UserAppRole_userId_orgId_idx" ON "app_quiksocial"."UserAppRole"("userId", "orgId");
CREATE UNIQUE INDEX "UserAppRole_userId_orgId_roleId_key" ON "app_quiksocial"."UserAppRole"("userId", "orgId", "roleId");
CREATE INDEX "RolePermission_roleId_idx" ON "app_quiksocial"."RolePermission"("roleId");
CREATE UNIQUE INDEX "RolePermission_roleId_resource_action_key" ON "app_quiksocial"."RolePermission"("roleId", "resource", "action");
CREATE INDEX "RoleNavigation_roleId_idx" ON "app_quiksocial"."RoleNavigation"("roleId");
CREATE UNIQUE INDEX "RoleNavigation_roleId_navKey_key" ON "app_quiksocial"."RoleNavigation"("roleId", "navKey");

-- AddForeignKey
ALTER TABLE "app_quiksocial"."AppRole" ADD CONSTRAINT "AppRole_appId_fkey" FOREIGN KEY ("appId") REFERENCES "quikit"."App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quiksocial"."AppRole" ADD CONSTRAINT "AppRole_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quiksocial"."UserAppRole" ADD CONSTRAINT "UserAppRole_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quiksocial"."UserAppRole" ADD CONSTRAINT "UserAppRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quiksocial"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quiksocial"."UserAppRole" ADD CONSTRAINT "UserAppRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quiksocial"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quiksocial"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quiksocial"."RoleNavigation" ADD CONSTRAINT "RoleNavigation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quiksocial"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

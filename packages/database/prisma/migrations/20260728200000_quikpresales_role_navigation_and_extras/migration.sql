-- QuikPreSales — RoleNavigation + UserPermissionExtra
--
-- Brings app_quikpresales to full RBAC v2 parity with app_quikscale /
-- app_quiktrack / app_quiklms. Purely additive: two new tables in an existing
-- schema, no change to anything already present.

-- CreateTable
CREATE TABLE "app_quikpresales"."RoleNavigation" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "navKey" TEXT NOT NULL,

    CONSTRAINT "RoleNavigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."UserPermissionExtra" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoleNavigation_roleId_idx" ON "app_quikpresales"."RoleNavigation"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleNavigation_roleId_navKey_key" ON "app_quikpresales"."RoleNavigation"("roleId", "navKey");

-- CreateIndex
CREATE INDEX "UserPermissionExtra_userId_orgId_idx" ON "app_quikpresales"."UserPermissionExtra"("userId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionExtra_orgId_userId_resource_action_key" ON "app_quikpresales"."UserPermissionExtra"("orgId", "userId", "resource", "action");

-- AddForeignKey
ALTER TABLE "app_quikpresales"."RoleNavigation" ADD CONSTRAINT "RoleNavigation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikpresales"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."UserPermissionExtra" ADD CONSTRAINT "UserPermissionExtra_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."UserPermissionExtra" ADD CONSTRAINT "UserPermissionExtra_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

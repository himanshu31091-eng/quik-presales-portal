-- =====================================================================
-- app_quikasset — standalone schema creation script
-- Generated from Prisma migration 20260703130000_add_quikfinance_quikasset_schemas
-- Safe to run against production. Wrapped in a single transaction:
--   any error rolls the whole script back (all-or-nothing).
-- Self-contained: all foreign keys are internal to this schema, so this
--   file has no dependency on any other schema and can be run standalone
--   in any order relative to the other app's script.
-- =====================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS "app_quikasset";

CREATE TYPE "app_quikasset"."AstStatus" AS ENUM ('Active', 'Inactive');

CREATE TYPE "app_quikasset"."AstAssetStatus" AS ENUM ('Available', 'Assigned', 'InRepair', 'Retired');

CREATE TYPE "app_quikasset"."AstRepairStatus" AS ENUM ('Pending', 'InRepair', 'Repaired', 'Recovered', 'Unrepairable');

CREATE TYPE "app_quikasset"."AstAssignmentStatus" AS ENUM ('Active', 'Returned');

CREATE TABLE "app_quikasset"."employees" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contact" TEXT,
    "department" TEXT,
    "designation" TEXT,
    "joiningDate" TEXT,
    "status" "app_quikasset"."AstStatus" NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."base_categories" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "base_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."categories" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseCategoryId" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."assets" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "warehouse" TEXT,
    "assetType" TEXT NOT NULL,
    "baseCategoryId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "purchaseDate" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "warrantyEndDate" TEXT,
    "description" TEXT NOT NULL,
    "assetStatus" "app_quikasset"."AstAssetStatus" NOT NULL DEFAULT 'Available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."repairs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "issueTitle" TEXT NOT NULL,
    "issueDescription" TEXT NOT NULL,
    "vendor" TEXT,
    "estimatedCost" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION,
    "sentDate" TEXT NOT NULL,
    "expectedReturn" TEXT,
    "returnedDate" TEXT,
    "status" "app_quikasset"."AstRepairStatus" NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repairs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."replacements" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replacements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."assignments" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "expectedReturn" TEXT,
    "notes" TEXT,
    "status" "app_quikasset"."AstAssignmentStatus" NOT NULL DEFAULT 'Active',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."fiscal_budgets" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "q1Amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "q2Amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "q3Amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "q4Amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "fiscal_budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."audit_logs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "details" TEXT,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."AppRole" (
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

CREATE TABLE "app_quikasset"."RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."RoleNavigation" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "navKey" TEXT NOT NULL,

    CONSTRAINT "RoleNavigation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."UserAppRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "UserAppRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."UserPermissionExtra" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionExtra_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employees_orgId_idx" ON "app_quikasset"."employees"("orgId");

CREATE UNIQUE INDEX "employees_orgId_employeeId_key" ON "app_quikasset"."employees"("orgId", "employeeId");

CREATE UNIQUE INDEX "employees_orgId_email_key" ON "app_quikasset"."employees"("orgId", "email");

CREATE INDEX "base_categories_orgId_idx" ON "app_quikasset"."base_categories"("orgId");

CREATE UNIQUE INDEX "base_categories_orgId_name_key" ON "app_quikasset"."base_categories"("orgId", "name");

CREATE INDEX "categories_orgId_idx" ON "app_quikasset"."categories"("orgId");

CREATE INDEX "categories_baseCategoryId_idx" ON "app_quikasset"."categories"("baseCategoryId");

CREATE UNIQUE INDEX "categories_orgId_name_baseCategoryId_key" ON "app_quikasset"."categories"("orgId", "name", "baseCategoryId");

CREATE INDEX "assets_orgId_idx" ON "app_quikasset"."assets"("orgId");

CREATE INDEX "assets_orgId_assetStatus_idx" ON "app_quikasset"."assets"("orgId", "assetStatus");

CREATE INDEX "assets_baseCategoryId_idx" ON "app_quikasset"."assets"("baseCategoryId");

CREATE INDEX "assets_categoryId_idx" ON "app_quikasset"."assets"("categoryId");

CREATE UNIQUE INDEX "assets_orgId_itemCode_key" ON "app_quikasset"."assets"("orgId", "itemCode");

CREATE UNIQUE INDEX "assets_orgId_serialNumber_key" ON "app_quikasset"."assets"("orgId", "serialNumber");

CREATE INDEX "repairs_orgId_idx" ON "app_quikasset"."repairs"("orgId");

CREATE INDEX "repairs_assetId_idx" ON "app_quikasset"."repairs"("assetId");

CREATE INDEX "replacements_orgId_idx" ON "app_quikasset"."replacements"("orgId");

CREATE INDEX "replacements_repairId_idx" ON "app_quikasset"."replacements"("repairId");

CREATE INDEX "replacements_assetId_idx" ON "app_quikasset"."replacements"("assetId");

CREATE INDEX "replacements_userId_idx" ON "app_quikasset"."replacements"("userId");

CREATE INDEX "assignments_orgId_idx" ON "app_quikasset"."assignments"("orgId");

CREATE INDEX "assignments_assetId_idx" ON "app_quikasset"."assignments"("assetId");

CREATE INDEX "assignments_userId_idx" ON "app_quikasset"."assignments"("userId");

CREATE INDEX "fiscal_budgets_orgId_idx" ON "app_quikasset"."fiscal_budgets"("orgId");

CREATE UNIQUE INDEX "fiscal_budgets_orgId_fiscalYear_key" ON "app_quikasset"."fiscal_budgets"("orgId", "fiscalYear");

CREATE INDEX "audit_logs_orgId_idx" ON "app_quikasset"."audit_logs"("orgId");

CREATE INDEX "audit_logs_orgId_createdAt_idx" ON "app_quikasset"."audit_logs"("orgId", "createdAt");

CREATE INDEX "audit_logs_orgId_module_idx" ON "app_quikasset"."audit_logs"("orgId", "module");

CREATE INDEX "AppRole_orgId_appId_idx" ON "app_quikasset"."AppRole"("orgId", "appId");

CREATE UNIQUE INDEX "AppRole_orgId_appId_name_key" ON "app_quikasset"."AppRole"("orgId", "appId", "name");

CREATE INDEX "RolePermission_roleId_idx" ON "app_quikasset"."RolePermission"("roleId");

CREATE UNIQUE INDEX "RolePermission_roleId_resource_action_key" ON "app_quikasset"."RolePermission"("roleId", "resource", "action");

CREATE INDEX "RoleNavigation_roleId_idx" ON "app_quikasset"."RoleNavigation"("roleId");

CREATE UNIQUE INDEX "RoleNavigation_roleId_navKey_key" ON "app_quikasset"."RoleNavigation"("roleId", "navKey");

CREATE INDEX "UserAppRole_roleId_idx" ON "app_quikasset"."UserAppRole"("roleId");

CREATE INDEX "UserAppRole_userId_orgId_idx" ON "app_quikasset"."UserAppRole"("userId", "orgId");

CREATE UNIQUE INDEX "UserAppRole_userId_orgId_roleId_key" ON "app_quikasset"."UserAppRole"("userId", "orgId", "roleId");

CREATE INDEX "UserPermissionExtra_userId_orgId_idx" ON "app_quikasset"."UserPermissionExtra"("userId", "orgId");

CREATE UNIQUE INDEX "UserPermissionExtra_orgId_userId_resource_action_key" ON "app_quikasset"."UserPermissionExtra"("orgId", "userId", "resource", "action");

ALTER TABLE "app_quikasset"."categories" ADD CONSTRAINT "categories_baseCategoryId_fkey" FOREIGN KEY ("baseCategoryId") REFERENCES "app_quikasset"."base_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."assets" ADD CONSTRAINT "assets_baseCategoryId_fkey" FOREIGN KEY ("baseCategoryId") REFERENCES "app_quikasset"."base_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."assets" ADD CONSTRAINT "assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "app_quikasset"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."repairs" ADD CONSTRAINT "repairs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "app_quikasset"."assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."replacements" ADD CONSTRAINT "replacements_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "app_quikasset"."repairs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."replacements" ADD CONSTRAINT "replacements_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "app_quikasset"."assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."replacements" ADD CONSTRAINT "replacements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_quikasset"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."assignments" ADD CONSTRAINT "assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "app_quikasset"."assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."assignments" ADD CONSTRAINT "assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_quikasset"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikasset"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."RoleNavigation" ADD CONSTRAINT "RoleNavigation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikasset"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."UserAppRole" ADD CONSTRAINT "UserAppRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikasset"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

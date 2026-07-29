-- FF-1: per-tenant per-app module feature flags (sparse storage — row exists
-- iff the module is explicitly DISABLED for the given tenant × app).
-- See docs/plans/FF-1-app-feature-flags.md.

CREATE TABLE "AppModuleFlag" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "appId"     TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled"   BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppModuleFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppModuleFlag_tenantId_appId_moduleKey_key"
    ON "AppModuleFlag" ("tenantId", "appId", "moduleKey");

CREATE INDEX "AppModuleFlag_tenantId_appId_idx"
    ON "AppModuleFlag" ("tenantId", "appId");

ALTER TABLE "AppModuleFlag"
  ADD CONSTRAINT "AppModuleFlag_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppModuleFlag"
  ADD CONSTRAINT "AppModuleFlag_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

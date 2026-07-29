-- Per-user read state for audit timelines (high-water mark). Additive + idempotent.

CREATE TABLE IF NOT EXISTS app_quikscale."AuditEventRead" (
    "id"         TEXT NOT NULL,
    "orgId"      TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId"   TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEventRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuditEventRead_userId_entityType_entityId_key"
    ON app_quikscale."AuditEventRead" ("userId", "entityType", "entityId");

CREATE INDEX IF NOT EXISTS "AuditEventRead_orgId_userId_entityType_idx"
    ON app_quikscale."AuditEventRead" ("orgId", "userId", "entityType");

ALTER TABLE app_quikscale."AuditEventRead" DROP CONSTRAINT IF EXISTS "AuditEventRead_orgId_fkey";
ALTER TABLE app_quikscale."AuditEventRead"
    ADD CONSTRAINT "AuditEventRead_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES quikit."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE app_quikscale."AuditEventRead" DROP CONSTRAINT IF EXISTS "AuditEventRead_userId_fkey";
ALTER TABLE app_quikscale."AuditEventRead"
    ADD CONSTRAINT "AuditEventRead_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES auth."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

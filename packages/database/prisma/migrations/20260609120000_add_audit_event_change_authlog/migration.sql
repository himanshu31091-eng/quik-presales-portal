-- Enterprise audit logging — Phase 1 (KPI).
--
-- Adds three purely-additive tables:
--   * app_quikscale."AuditEvent"  — one row per business action (KPI for now)
--   * app_quikscale."AuditChange" — one row per changed field (field-level diff)
--   * public."AuthLog"            — authentication / security audit trail
--
-- No existing tables are altered (Prisma back-relations on Org/User are
-- virtual and add no columns). Safe to run alongside the legacy KPILog table
-- during the dual-write transition.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS).

-- 1. Tables ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "app_quikscale"."AuditEvent" (
    "id"          TEXT NOT NULL,
    "orgId"       TEXT NOT NULL,
    "teamId"      TEXT,
    "entityType"  TEXT NOT NULL,
    "entityId"    TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName"   TEXT NOT NULL,
    "source"      TEXT NOT NULL DEFAULT 'web',
    "ipAddress"   TEXT,
    "userAgent"   TEXT,
    "reason"      TEXT,
    "snapshot"    JSONB,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikscale"."AuditChange" (
    "id"           TEXT NOT NULL,
    "auditEventId" TEXT NOT NULL,
    "fieldName"    TEXT NOT NULL,
    "oldValue"     JSONB,
    "newValue"     JSONB,
    CONSTRAINT "AuditChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."AuthLog" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT,
    "orgId"     TEXT,
    "email"     TEXT,
    "event"     TEXT NOT NULL,
    "outcome"   TEXT NOT NULL DEFAULT 'success',
    "reason"    TEXT,
    "appSlug"   TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata"  JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthLog_pkey" PRIMARY KEY ("id")
);

-- 2. Indexes -----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "AuditEvent_orgId_entityType_entityId_createdAt_idx"
    ON "app_quikscale"."AuditEvent" ("orgId", "entityType", "entityId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditEvent_orgId_actorUserId_createdAt_idx"
    ON "app_quikscale"."AuditEvent" ("orgId", "actorUserId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditEvent_orgId_teamId_createdAt_idx"
    ON "app_quikscale"."AuditEvent" ("orgId", "teamId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditEvent_orgId_createdAt_idx"
    ON "app_quikscale"."AuditEvent" ("orgId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditEvent_orgId_action_createdAt_idx"
    ON "app_quikscale"."AuditEvent" ("orgId", "action", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "AuditChange_auditEventId_idx"
    ON "app_quikscale"."AuditChange" ("auditEventId");
CREATE INDEX IF NOT EXISTS "AuditChange_fieldName_idx"
    ON "app_quikscale"."AuditChange" ("fieldName");

CREATE INDEX IF NOT EXISTS "AuthLog_userId_createdAt_idx"
    ON "public"."AuthLog" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthLog_orgId_createdAt_idx"
    ON "public"."AuthLog" ("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthLog_event_createdAt_idx"
    ON "public"."AuthLog" ("event", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthLog_createdAt_idx"
    ON "public"."AuthLog" ("createdAt");

-- 3. Foreign keys ------------------------------------------------------------

ALTER TABLE "app_quikscale"."AuditEvent" DROP CONSTRAINT IF EXISTS "AuditEvent_orgId_fkey";
ALTER TABLE "app_quikscale"."AuditEvent"
    ADD CONSTRAINT "AuditEvent_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikscale"."AuditChange" DROP CONSTRAINT IF EXISTS "AuditChange_auditEventId_fkey";
ALTER TABLE "app_quikscale"."AuditChange"
    ADD CONSTRAINT "AuditChange_auditEventId_fkey"
    FOREIGN KEY ("auditEventId") REFERENCES "app_quikscale"."AuditEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."AuthLog" DROP CONSTRAINT IF EXISTS "AuthLog_orgId_fkey";
ALTER TABLE "public"."AuthLog"
    ADD CONSTRAINT "AuthLog_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."AuthLog" DROP CONSTRAINT IF EXISTS "AuthLog_userId_fkey";
ALTER TABLE "public"."AuthLog"
    ADD CONSTRAINT "AuthLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

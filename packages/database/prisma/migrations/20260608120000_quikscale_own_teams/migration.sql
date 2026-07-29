-- QuikScale owns its own teams.
--
-- Creates app_quikscale."Team" (model QsTeam) and app_quikscale."UserTeam"
-- (model QsUserTeam), copies every row from public."Team" / public."UserTeam"
-- preserving ids, and repoints the QuikScale-owned foreign keys
-- (KPI / Priority / AccountabilityFunction / OrgMember .teamId) at the new
-- tables. public."Team" and public."UserTeam" are left fully intact for the
-- Admin Portal and QuikTrack. OrgMember.teamId is written only by QuikScale,
-- so repointing its FK does not affect any other app.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / ON CONFLICT / DROP IF EXISTS).

-- 1. Tables ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "app_quikscale"."Team" (
    "id"           TEXT NOT NULL,
    "orgId"        TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "slug"         TEXT NOT NULL,
    "parentTeamId" TEXT,
    "headId"       TEXT,
    "color"        TEXT DEFAULT '#0066cc',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    "createdBy"    TEXT,
    "deletedAt"    TIMESTAMP(3),
    CONSTRAINT "QsTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikscale"."UserTeam" (
    "id"        TEXT NOT NULL,
    "orgId"     TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "teamId"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QsUserTeam_pkey" PRIMARY KEY ("id")
);

-- 2. Indexes -----------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "QsTeam_orgId_slug_key" ON "app_quikscale"."Team"("orgId", "slug");
CREATE INDEX IF NOT EXISTS "QsTeam_orgId_idx"        ON "app_quikscale"."Team"("orgId");
CREATE INDEX IF NOT EXISTS "QsTeam_parentTeamId_idx" ON "app_quikscale"."Team"("parentTeamId");
CREATE INDEX IF NOT EXISTS "QsTeam_deletedAt_idx"    ON "app_quikscale"."Team"("deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "QsUserTeam_orgId_userId_teamId_key" ON "app_quikscale"."UserTeam"("orgId", "userId", "teamId");
CREATE INDEX IF NOT EXISTS "QsUserTeam_orgId_idx"  ON "app_quikscale"."UserTeam"("orgId");
CREATE INDEX IF NOT EXISTS "QsUserTeam_userId_idx" ON "app_quikscale"."UserTeam"("userId");
CREATE INDEX IF NOT EXISTS "QsUserTeam_teamId_idx" ON "app_quikscale"."UserTeam"("teamId");

-- 3. Copy data (ids preserved) ----------------------------------------------

INSERT INTO "app_quikscale"."Team"
    ("id", "orgId", "name", "description", "slug", "parentTeamId", "headId", "color", "createdAt", "updatedAt", "createdBy", "deletedAt")
SELECT
    "id", "orgId", "name", "description", "slug", "parentTeamId", "headId", "color", "createdAt", "updatedAt", "createdBy", "deletedAt"
FROM "public"."Team"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "app_quikscale"."UserTeam"
    ("id", "orgId", "userId", "teamId", "createdAt")
SELECT
    "id", "orgId", "userId", "teamId", "createdAt"
FROM "public"."UserTeam"
ON CONFLICT ("id") DO NOTHING;

-- 4. Foreign keys on the new tables -----------------------------------------

ALTER TABLE "app_quikscale"."Team" DROP CONSTRAINT IF EXISTS "QsTeam_orgId_fkey";
ALTER TABLE "app_quikscale"."Team"
    ADD CONSTRAINT "QsTeam_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikscale"."Team" DROP CONSTRAINT IF EXISTS "QsTeam_parentTeamId_fkey";
ALTER TABLE "app_quikscale"."Team"
    ADD CONSTRAINT "QsTeam_parentTeamId_fkey"
    FOREIGN KEY ("parentTeamId") REFERENCES "app_quikscale"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_quikscale"."UserTeam" DROP CONSTRAINT IF EXISTS "QsUserTeam_orgId_fkey";
ALTER TABLE "app_quikscale"."UserTeam"
    ADD CONSTRAINT "QsUserTeam_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikscale"."UserTeam" DROP CONSTRAINT IF EXISTS "QsUserTeam_userId_fkey";
ALTER TABLE "app_quikscale"."UserTeam"
    ADD CONSTRAINT "QsUserTeam_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikscale"."UserTeam" DROP CONSTRAINT IF EXISTS "QsUserTeam_teamId_fkey";
ALTER TABLE "app_quikscale"."UserTeam"
    ADD CONSTRAINT "QsUserTeam_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "app_quikscale"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Repoint QuikScale-owned FKs from public."Team" -> app_quikscale."Team" --

ALTER TABLE "app_quikscale"."KPI" DROP CONSTRAINT IF EXISTS "KPI_teamId_fkey";
ALTER TABLE "app_quikscale"."KPI"
    ADD CONSTRAINT "KPI_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "app_quikscale"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_quikscale"."Priority" DROP CONSTRAINT IF EXISTS "Priority_teamId_fkey";
ALTER TABLE "app_quikscale"."Priority"
    ADD CONSTRAINT "Priority_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "app_quikscale"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_quikscale"."AccountabilityFunction" DROP CONSTRAINT IF EXISTS "AccountabilityFunction_teamId_fkey";
ALTER TABLE "app_quikscale"."AccountabilityFunction"
    ADD CONSTRAINT "AccountabilityFunction_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "app_quikscale"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quikit"."OrgMember" DROP CONSTRAINT IF EXISTS "OrgMember_teamId_fkey";
ALTER TABLE "quikit"."OrgMember"
    ADD CONSTRAINT "OrgMember_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "app_quikscale"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

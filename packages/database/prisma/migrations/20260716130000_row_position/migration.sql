-- QuikScale: manual drag-to-reorder ROW order (org-shared) for the core grids.
-- Adds a nullable Float `position` + an (orgId, position) index to each entity,
-- then backfills existing rows so the current newest-first default view is
-- preserved (position = descending-createdAt rank * 1000, spaced for inserts).
-- Idempotent (IF NOT EXISTS); safe to re-run.

-- KPI
ALTER TABLE "app_quikscale"."KPI"                 ADD COLUMN IF NOT EXISTS "position" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "KPI_orgId_position_idx"                 ON "app_quikscale"."KPI" ("orgId", "position");
-- Priority
ALTER TABLE "app_quikscale"."Priority"            ADD COLUMN IF NOT EXISTS "position" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "Priority_orgId_position_idx"            ON "app_quikscale"."Priority" ("orgId", "position");
-- WWWItem
ALTER TABLE "app_quikscale"."WWWItem"             ADD COLUMN IF NOT EXISTS "position" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "WWWItem_orgId_position_idx"             ON "app_quikscale"."WWWItem" ("orgId", "position");
-- Client
ALTER TABLE "app_quikscale"."Client"              ADD COLUMN IF NOT EXISTS "position" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "Client_orgId_position_idx"              ON "app_quikscale"."Client" ("orgId", "position");
-- ClientMember
ALTER TABLE "app_quikscale"."ClientMember"        ADD COLUMN IF NOT EXISTS "position" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "ClientMember_orgId_position_idx"        ON "app_quikscale"."ClientMember" ("orgId", "position");
-- ClientDailyHuddle
ALTER TABLE "app_quikscale"."ClientDailyHuddle"   ADD COLUMN IF NOT EXISTS "position" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "ClientDailyHuddle_orgId_position_idx"   ON "app_quikscale"."ClientDailyHuddle" ("orgId", "position");
-- ClientWeeklyMeeting
ALTER TABLE "app_quikscale"."ClientWeeklyMeeting" ADD COLUMN IF NOT EXISTS "position" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "ClientWeeklyMeeting_orgId_position_idx" ON "app_quikscale"."ClientWeeklyMeeting" ("orgId", "position");

-- Backfill: preserve today's newest-first order. Rank rows per org by createdAt
-- DESC and multiply by 1000 to leave gaps for future fractional inserts.
UPDATE "app_quikscale"."KPI" k SET "position" = s.rn * 1000
  FROM (SELECT "id", row_number() OVER (PARTITION BY "orgId" ORDER BY "createdAt" DESC) rn FROM "app_quikscale"."KPI") s
  WHERE k."id" = s."id" AND k."position" IS NULL;
UPDATE "app_quikscale"."Priority" p SET "position" = s.rn * 1000
  FROM (SELECT "id", row_number() OVER (PARTITION BY "orgId" ORDER BY "createdAt" DESC) rn FROM "app_quikscale"."Priority") s
  WHERE p."id" = s."id" AND p."position" IS NULL;
UPDATE "app_quikscale"."WWWItem" w SET "position" = s.rn * 1000
  FROM (SELECT "id", row_number() OVER (PARTITION BY "orgId" ORDER BY "createdAt" DESC) rn FROM "app_quikscale"."WWWItem") s
  WHERE w."id" = s."id" AND w."position" IS NULL;
UPDATE "app_quikscale"."Client" c SET "position" = s.rn * 1000
  FROM (SELECT "id", row_number() OVER (PARTITION BY "orgId" ORDER BY "createdAt" DESC) rn FROM "app_quikscale"."Client") s
  WHERE c."id" = s."id" AND c."position" IS NULL;
UPDATE "app_quikscale"."ClientMember" m SET "position" = s.rn * 1000
  FROM (SELECT "id", row_number() OVER (PARTITION BY "orgId" ORDER BY "createdAt" DESC) rn FROM "app_quikscale"."ClientMember") s
  WHERE m."id" = s."id" AND m."position" IS NULL;
UPDATE "app_quikscale"."ClientDailyHuddle" d SET "position" = s.rn * 1000
  FROM (SELECT "id", row_number() OVER (PARTITION BY "orgId" ORDER BY "createdAt" DESC) rn FROM "app_quikscale"."ClientDailyHuddle") s
  WHERE d."id" = s."id" AND d."position" IS NULL;
UPDATE "app_quikscale"."ClientWeeklyMeeting" wm SET "position" = s.rn * 1000
  FROM (SELECT "id", row_number() OVER (PARTITION BY "orgId" ORDER BY "createdAt" DESC) rn FROM "app_quikscale"."ClientWeeklyMeeting") s
  WHERE wm."id" = s."id" AND wm."position" IS NULL;

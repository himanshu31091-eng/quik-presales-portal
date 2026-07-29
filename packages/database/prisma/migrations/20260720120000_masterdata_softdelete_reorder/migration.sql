-- QuikScale: bring the master-data grids (Category / Unit) in line with the
-- KPI/Priority/WWW grids — add soft-delete (`deletedAt`) + manual drag-to-reorder
-- (`position`) columns, plus their indexes. Backfills `position` so the current
-- default order is preserved. Additive, nullable, idempotent (safe re-run).
-- (Quarter Settings is a fiscal-year config tool, not a flat grid — excluded.)

-- ── CategoryMaster ──────────────────────────────────────────────────────────
ALTER TABLE "app_quikscale"."CategoryMaster" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "app_quikscale"."CategoryMaster" ADD COLUMN IF NOT EXISTS "position"  DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "CategoryMaster_orgId_deletedAt_idx" ON "app_quikscale"."CategoryMaster" ("orgId", "deletedAt");
CREATE INDEX IF NOT EXISTS "CategoryMaster_orgId_position_idx"  ON "app_quikscale"."CategoryMaster" ("orgId", "position");

-- ── UnitMaster ──────────────────────────────────────────────────────────────
ALTER TABLE "app_quikscale"."UnitMaster" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "app_quikscale"."UnitMaster" ADD COLUMN IF NOT EXISTS "position"  DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "UnitMaster_orgId_deletedAt_idx" ON "app_quikscale"."UnitMaster" ("orgId", "deletedAt");
CREATE INDEX IF NOT EXISTS "UnitMaster_orgId_position_idx"  ON "app_quikscale"."UnitMaster" ("orgId", "position");

-- Backfill `position` preserving each grid's current default view (createdAt ASC,
-- see api/categories & api/units GET). Ranks are spaced by 1000 to leave gaps for
-- future fractional inserts.
UPDATE "app_quikscale"."CategoryMaster" c SET "position" = s.rn * 1000
  FROM (SELECT "id", row_number() OVER (PARTITION BY "orgId" ORDER BY "createdAt" ASC) rn FROM "app_quikscale"."CategoryMaster") s
  WHERE c."id" = s."id" AND c."position" IS NULL;
UPDATE "app_quikscale"."UnitMaster" u SET "position" = s.rn * 1000
  FROM (SELECT "id", row_number() OVER (PARTITION BY "orgId" ORDER BY "createdAt" ASC) rn FROM "app_quikscale"."UnitMaster") s
  WHERE u."id" = s."id" AND u."position" IS NULL;

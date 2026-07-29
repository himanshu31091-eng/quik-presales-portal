-- One-shot OPSP data wipe (2026-05-18)
-- Context: schema change — critical-num bullets become numeric, review entries
-- collapse from 4-per-row (one per color band) to 1-per-row. Wiping all OPSP
-- data first lets the new shape land cleanly without a backfill migration.
--
-- Scope: every org, every quarter. Irreversible.
-- Run via: cd packages/database && npx prisma db execute --file prisma/scripts/wipe-opsp-2026-05-18.sql --schema prisma/schema.prisma

DELETE FROM "app_quikscale"."OPSPReviewEntry";
DELETE FROM "app_quikscale"."OPSPData";

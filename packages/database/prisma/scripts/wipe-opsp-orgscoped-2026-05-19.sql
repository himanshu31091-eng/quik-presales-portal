-- Org-scoped OPSP wipe (2026-05-19)
-- Scope: every org that user 'ashwin@moreyeahs.com' belongs to.
-- Tables: OPSPReviewEntry (child) → OPSPData (parent) → CategoryMaster.
-- OPSPReviewEntry deleted first explicitly even though FK has ON DELETE
-- CASCADE — keeps the script self-documenting and the order obvious.
-- Run via:
--   cd packages/database && npx prisma db execute \
--     --file prisma/scripts/wipe-opsp-orgscoped-2026-05-19.sql \
--     --schema prisma/schema.prisma
BEGIN;

DELETE FROM "app_quikscale"."OPSPReviewEntry"
WHERE "orgId" IN (
  SELECT om."orgId" FROM "quikit"."OrgMember" om
  JOIN "auth"."User" u ON u.id = om."userId"
  WHERE u.email = 'ashwin@moreyeahs.com'
);

DELETE FROM "app_quikscale"."OPSPData"
WHERE "orgId" IN (
  SELECT om."orgId" FROM "quikit"."OrgMember" om
  JOIN "auth"."User" u ON u.id = om."userId"
  WHERE u.email = 'ashwin@moreyeahs.com'
);

DELETE FROM "app_quikscale"."CategoryMaster"
WHERE "orgId" IN (
  SELECT om."orgId" FROM "quikit"."OrgMember" om
  JOIN "auth"."User" u ON u.id = om."userId"
  WHERE u.email = 'ashwin@moreyeahs.com'
);

COMMIT;

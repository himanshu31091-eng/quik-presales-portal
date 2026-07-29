-- READ-ONLY preview: count rows that the org-scoped wipe would delete.
-- Scope: every org that user 'ashwin@moreyeahs.com' belongs to.
-- Tables: OPSPData, OPSPReviewEntry, CategoryMaster (in app_quikscale schema).
-- Run via:
--   cd packages/database && npx prisma db execute \
--     --file prisma/scripts/preview-wipe-orgscoped-2026-05-19.sql \
--     --schema prisma/schema.prisma
SELECT 'OPSPData' AS table_name, COUNT(*) AS rows
FROM "app_quikscale"."OPSPData"
WHERE "orgId" IN (
  SELECT om."orgId" FROM "quikit"."OrgMember" om
  JOIN "auth"."User" u ON u.id = om."userId"
  WHERE u.email = 'ashwin@moreyeahs.com'
)
UNION ALL
SELECT 'OPSPReviewEntry', COUNT(*)
FROM "app_quikscale"."OPSPReviewEntry"
WHERE "orgId" IN (
  SELECT om."orgId" FROM "quikit"."OrgMember" om
  JOIN "auth"."User" u ON u.id = om."userId"
  WHERE u.email = 'ashwin@moreyeahs.com'
)
UNION ALL
SELECT 'CategoryMaster', COUNT(*)
FROM "app_quikscale"."CategoryMaster"
WHERE "orgId" IN (
  SELECT om."orgId" FROM "quikit"."OrgMember" om
  JOIN "auth"."User" u ON u.id = om."userId"
  WHERE u.email = 'ashwin@moreyeahs.com'
);

-- Drops the abandoned Material Issue line table (CnMaterialIssueLine -> "Material_issue_lines").
-- Material issue lines are stored as a JSONB `materials` column on the header
-- table ("cn_material_issues" / CnMaterialIssue) — see lib/store/material-issue-repository.ts,
-- which reads/writes `row.materials`. The relational line table is never read or
-- written by application code; only the moreyeahs seed still populated it, and
-- that reference has been removed. The CnMaterialIssueLine model has been
-- removed from schema.prisma.
--
-- No other table has a foreign key INTO "Material_issue_lines": the only
-- constraints live ON this table (issueId -> Material_issues, itemId -> Items,
-- uomId -> Uoms). CASCADE clears them on drop.

-- DropForeignKey (Prisma default names; IF EXISTS so a name mismatch is a no-op)
ALTER TABLE "app_quikinfra"."Material_issue_lines" DROP CONSTRAINT IF EXISTS "Material_issue_lines_issueId_fkey";
ALTER TABLE "app_quikinfra"."Material_issue_lines" DROP CONSTRAINT IF EXISTS "Material_issue_lines_itemId_fkey";
ALTER TABLE "app_quikinfra"."Material_issue_lines" DROP CONSTRAINT IF EXISTS "Material_issue_lines_uomId_fkey";

-- DropTable
DROP TABLE IF EXISTS "app_quikinfra"."Material_issue_lines" CASCADE;

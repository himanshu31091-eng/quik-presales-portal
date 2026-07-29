-- Drops the legacy v1 BOQ table (CnBOQItem -> "Boq_items").
-- Superseded by CnBOQItemV2 ("Boq_items_v2"), which every runtime path
-- (import, DPR, RAB, progress/billing ledgers, dashboard) now uses. The v1
-- table holds no data and the CnBOQItem model has been removed from
-- schema.prisma; its last reader (the dashboard project-progress widget) and
-- the moreyeahs seed were repointed to v2.
--
-- No other table has a foreign key INTO "Boq_items": every boqItemId column
-- (Wo_lines, Dpr_work_items, Rab_lines, Boq_progress_ledger, Boq_billing_ledger,
-- Material_estimations, Dpr_labour_entries) is a plain string, not an FK.
-- The only constraints live ON "Boq_items" itself (projectId + self parentId).

-- DropForeignKey (Prisma default names; IF EXISTS so a name mismatch is a no-op)
ALTER TABLE "app_quikinfra"."Boq_items" DROP CONSTRAINT IF EXISTS "Boq_items_projectId_fkey";
ALTER TABLE "app_quikinfra"."Boq_items" DROP CONSTRAINT IF EXISTS "Boq_items_parentId_fkey";

-- DropTable (CASCADE clears the self-referential hierarchy constraint on drop)
DROP TABLE IF EXISTS "app_quikinfra"."Boq_items" CASCADE;
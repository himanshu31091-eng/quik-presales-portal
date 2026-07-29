-- AlterTable: add operator trade column to DPR manpower grid
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN "operator" DECIMAL(18,4);

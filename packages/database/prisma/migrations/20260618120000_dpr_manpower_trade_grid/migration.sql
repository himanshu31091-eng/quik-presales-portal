-- AlterTable: wide trade-grid columns for DPR manpower section
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN "workingArea" TEXT;
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN "messan" DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN "maleHelper" DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN "femaleHelper" DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN "carpenter" DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN "fitter" DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN "painter" DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN "plumber" DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN "electrician" DECIMAL(18,4);

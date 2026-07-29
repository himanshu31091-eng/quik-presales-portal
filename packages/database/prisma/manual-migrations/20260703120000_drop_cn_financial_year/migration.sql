-- Drops the Financial Years master (CnFinancialYear).
-- The /masters/financial-years page + API were removed and the Reports FY
-- selector now computes the current FY from the date (no master table needed).

-- DropForeignKey
ALTER TABLE "app_quikinfra"."Financial_years" DROP CONSTRAINT IF EXISTS "Financial_years_companyId_fkey";
ALTER TABLE "app_quikinfra"."Financial_years" DROP CONSTRAINT IF EXISTS "Financial_years_orgId_fkey";

-- DropTable
DROP TABLE IF EXISTS "app_quikinfra"."Financial_years";

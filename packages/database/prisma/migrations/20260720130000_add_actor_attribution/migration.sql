-- AlterTable
ALTER TABLE "app_quikasset"."assets" ADD COLUMN     "createdByUserId" TEXT;

-- AlterTable
ALTER TABLE "app_quikasset"."assignments" ADD COLUMN     "assignedByUserId" TEXT;

-- AlterTable
ALTER TABLE "app_quikasset"."repairs" ADD COLUMN     "createdByUserId" TEXT;

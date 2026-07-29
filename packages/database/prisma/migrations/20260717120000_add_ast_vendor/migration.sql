-- CreateEnum
CREATE TYPE "app_quikasset"."AstVendorStatus" AS ENUM ('Active', 'Inactive');

-- AlterTable
ALTER TABLE "app_quikasset"."repairs" ADD COLUMN     "vendorId" TEXT;

-- CreateTable
CREATE TABLE "app_quikasset"."vendors" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "status" "app_quikasset"."AstVendorStatus" NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_orgId_idx" ON "app_quikasset"."vendors"("orgId");

-- CreateIndex
CREATE INDEX "repairs_vendorId_idx" ON "app_quikasset"."repairs"("vendorId");

-- AddForeignKey
ALTER TABLE "app_quikasset"."repairs" ADD CONSTRAINT "repairs_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "app_quikasset"."vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

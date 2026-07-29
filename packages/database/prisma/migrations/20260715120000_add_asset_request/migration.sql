-- CreateEnum
CREATE TYPE "app_quikasset"."AstAssetRequestKind" AS ENUM ('Physical', 'Subscription');

-- CreateEnum
CREATE TYPE "app_quikasset"."AstAssetRequestType" AS ENUM ('New', 'Replacement', 'Upgrade', 'Additional');

-- CreateEnum
CREATE TYPE "app_quikasset"."AstAssetRequestPriority" AS ENUM ('Low', 'Medium', 'High', 'Urgent');

-- CreateEnum
CREATE TYPE "app_quikasset"."AstAssetRequestStatus" AS ENUM ('Draft', 'Submitted', 'PendingApproval', 'Approved', 'Rejected', 'PartiallyFulfilled', 'Fulfilled', 'Cancelled');

-- AlterTable
ALTER TABLE "app_quikasset"."assets" ADD COLUMN     "invoiceFileKey" TEXT,
ADD COLUMN     "invoiceFileName" TEXT,
ADD COLUMN     "invoiceFileType" TEXT,
ADD COLUMN     "invoiceFileSize" INTEGER;

-- AlterTable
ALTER TABLE "app_quikasset"."assignments" ADD COLUMN     "requestId" TEXT;

-- CreateTable
CREATE TABLE "app_quikasset"."asset_requests" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "itemKind" "app_quikasset"."AstAssetRequestKind" NOT NULL DEFAULT 'Physical',
    "itemType" TEXT NOT NULL,
    "baseCategoryId" TEXT,
    "categoryId" TEXT,
    "requestType" "app_quikasset"."AstAssetRequestType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quantityFulfilled" INTEGER NOT NULL DEFAULT 0,
    "justification" TEXT NOT NULL,
    "priority" "app_quikasset"."AstAssetRequestPriority" NOT NULL DEFAULT 'Medium',
    "requiredBy" TEXT,
    "status" "app_quikasset"."AstAssetRequestStatus" NOT NULL DEFAULT 'Draft',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "fulfilmentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_requests_orgId_idx" ON "app_quikasset"."asset_requests"("orgId");

-- CreateIndex
CREATE INDEX "asset_requests_orgId_status_idx" ON "app_quikasset"."asset_requests"("orgId", "status");

-- CreateIndex
CREATE INDEX "asset_requests_requesterUserId_idx" ON "app_quikasset"."asset_requests"("requesterUserId");

-- CreateIndex
CREATE INDEX "assignments_requestId_idx" ON "app_quikasset"."assignments"("requestId");

-- AddForeignKey
ALTER TABLE "app_quikasset"."assignments" ADD CONSTRAINT "assignments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "app_quikasset"."asset_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

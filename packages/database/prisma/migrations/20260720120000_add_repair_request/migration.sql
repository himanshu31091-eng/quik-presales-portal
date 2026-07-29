-- CreateEnum
CREATE TYPE "app_quikasset"."AstRepairRequestStatus" AS ENUM ('Submitted', 'Approved', 'Rejected', 'Fulfilled', 'Cancelled');

-- CreateEnum
CREATE TYPE "app_quikasset"."AstRepairRequestUrgency" AS ENUM ('Low', 'Medium', 'High', 'Urgent');

-- CreateTable
CREATE TABLE "app_quikasset"."repair_requests" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "issueTitle" TEXT NOT NULL,
    "issueDescription" TEXT NOT NULL,
    "urgency" "app_quikasset"."AstRepairRequestUrgency" NOT NULL DEFAULT 'Medium',
    "status" "app_quikasset"."AstRepairRequestStatus" NOT NULL DEFAULT 'Submitted',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "repairId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repair_requests_orgId_idx" ON "app_quikasset"."repair_requests"("orgId");

-- CreateIndex
CREATE INDEX "repair_requests_orgId_status_idx" ON "app_quikasset"."repair_requests"("orgId", "status");

-- CreateIndex
CREATE INDEX "repair_requests_requesterUserId_idx" ON "app_quikasset"."repair_requests"("requesterUserId");

-- CreateIndex
CREATE INDEX "repair_requests_assetId_idx" ON "app_quikasset"."repair_requests"("assetId");

-- CreateIndex
CREATE INDEX "repair_requests_repairId_idx" ON "app_quikasset"."repair_requests"("repairId");

-- AddForeignKey
ALTER TABLE "app_quikasset"."repair_requests" ADD CONSTRAINT "repair_requests_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "app_quikasset"."assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikasset"."repair_requests" ADD CONSTRAINT "repair_requests_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "app_quikasset"."repairs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

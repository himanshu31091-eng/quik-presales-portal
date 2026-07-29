-- CreateTable
CREATE TABLE "OPSPData" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "targetYears" INTEGER NOT NULL DEFAULT 5,
    "employees" JSONB,
    "customers" JSONB,
    "shareholders" JSONB,
    "coreValues" TEXT,
    "purpose" TEXT,
    "actions" JSONB,
    "profitPerX" TEXT,
    "bhag" TEXT,
    "targetRows" JSONB,
    "sandbox" TEXT,
    "keyThrusts" JSONB,
    "brandPromiseKPIs" TEXT,
    "brandPromise" TEXT,
    "goalRows" JSONB,
    "keyInitiatives" TEXT,
    "criticalNumGoals" JSONB,
    "balancingCritNumGoals" JSONB,
    "processItems" JSONB,
    "weaknesses" JSONB,
    "makeBuy" JSONB,
    "sell" JSONB,
    "recordKeeping" JSONB,
    "actionsQtr" JSONB,
    "rocks" TEXT,
    "criticalNumProcess" JSONB,
    "balancingCritNumProcess" JSONB,
    "theme" TEXT,
    "scoreboardDesign" TEXT,
    "celebration" TEXT,
    "reward" TEXT,
    "kpiAccountability" JSONB,
    "quarterlyPriorities" JSONB,
    "criticalNumAcct" JSONB,
    "balancingCritNumAcct" JSONB,
    "trends" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "OPSPData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OPSPData_tenantId_idx" ON "OPSPData"("tenantId");

-- CreateIndex
CREATE INDEX "OPSPData_userId_idx" ON "OPSPData"("userId");

-- CreateIndex
CREATE INDEX "OPSPData_year_quarter_idx" ON "OPSPData"("year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "OPSPData_tenantId_userId_year_quarter_key" ON "OPSPData"("tenantId", "userId", "year", "quarter");

-- AddForeignKey
ALTER TABLE "OPSPData" ADD CONSTRAINT "OPSPData_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OPSPData" ADD CONSTRAINT "OPSPData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

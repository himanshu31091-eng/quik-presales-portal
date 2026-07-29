-- AlterTable
ALTER TABLE "KPI" ADD COLUMN     "divisionType" TEXT NOT NULL DEFAULT 'Cumulative',
ADD COLUMN     "weeklyTargets" JSONB;

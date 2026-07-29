-- AlterTable
ALTER TABLE "app_quikasset"."employees" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "employees_userId_idx" ON "app_quikasset"."employees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_orgId_userId_key" ON "app_quikasset"."employees"("orgId", "userId");

-- AddForeignKey
ALTER TABLE "app_quikasset"."employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

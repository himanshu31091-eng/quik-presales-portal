-- CreateTable
CREATE TABLE "app_quikasset"."user_removals" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedBy" TEXT,

    CONSTRAINT "user_removals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_removals_orgId_idx" ON "app_quikasset"."user_removals"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "user_removals_orgId_userId_key" ON "app_quikasset"."user_removals"("orgId", "userId");

-- CreateTable
CREATE TABLE "Impersonation" (
    "id" TEXT NOT NULL,
    "superAdminId" TEXT NOT NULL,
    "targetTenantId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetAppSlug" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "exitedAt" TIMESTAMP(3),
    "reason" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Impersonation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Impersonation_token_key" ON "Impersonation"("token");

-- CreateIndex
CREATE INDEX "Impersonation_superAdminId_createdAt_idx" ON "Impersonation"("superAdminId", "createdAt");

-- CreateIndex
CREATE INDEX "Impersonation_targetTenantId_createdAt_idx" ON "Impersonation"("targetTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Impersonation_targetUserId_createdAt_idx" ON "Impersonation"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Impersonation_expiresAt_idx" ON "Impersonation"("expiresAt");


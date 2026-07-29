-- CreateTable
CREATE TABLE "ApiCall" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "appSlug" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "pathPattern" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCallHourlyRollup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "appSlug" TEXT NOT NULL,
    "hourBucket" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "pathPattern" TEXT NOT NULL,
    "statusClass" TEXT NOT NULL,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "totalDurationMs" BIGINT NOT NULL DEFAULT 0,
    "maxDurationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCallHourlyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppHealthCheck" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppHealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "appSlug" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "targetTenantIds" TEXT[],
    "targetAppSlugs" TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastDismissal" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAppAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAppAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" INTEGER NOT NULL DEFAULT 0,
    "priceYearly" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "limits" JSONB,
    "features" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planSlug" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "notes" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiCall_tenantId_createdAt_idx" ON "ApiCall"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiCall_appSlug_createdAt_idx" ON "ApiCall"("appSlug", "createdAt");

-- CreateIndex
CREATE INDEX "ApiCall_createdAt_idx" ON "ApiCall"("createdAt");

-- CreateIndex
CREATE INDEX "ApiCall_userId_createdAt_idx" ON "ApiCall"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiCallHourlyRollup_tenantId_hourBucket_idx" ON "ApiCallHourlyRollup"("tenantId", "hourBucket");

-- CreateIndex
CREATE INDEX "ApiCallHourlyRollup_appSlug_hourBucket_idx" ON "ApiCallHourlyRollup"("appSlug", "hourBucket");

-- CreateIndex
CREATE INDEX "ApiCallHourlyRollup_hourBucket_idx" ON "ApiCallHourlyRollup"("hourBucket");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCallHourlyRollup_tenantId_appSlug_hourBucket_method_path_key" ON "ApiCallHourlyRollup"("tenantId", "appSlug", "hourBucket", "method", "pathPattern", "statusClass");

-- CreateIndex
CREATE INDEX "AppHealthCheck_appId_checkedAt_idx" ON "AppHealthCheck"("appId", "checkedAt");

-- CreateIndex
CREATE INDEX "AppHealthCheck_checkedAt_idx" ON "AppHealthCheck"("checkedAt");

-- CreateIndex
CREATE INDEX "SessionEvent_tenantId_createdAt_idx" ON "SessionEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SessionEvent_userId_createdAt_idx" ON "SessionEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SessionEvent_createdAt_idx" ON "SessionEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SessionEvent_event_createdAt_idx" ON "SessionEvent"("event", "createdAt");

-- CreateIndex
CREATE INDEX "BroadcastAnnouncement_startsAt_idx" ON "BroadcastAnnouncement"("startsAt");

-- CreateIndex
CREATE INDEX "BroadcastAnnouncement_endsAt_idx" ON "BroadcastAnnouncement"("endsAt");

-- CreateIndex
CREATE INDEX "BroadcastDismissal_userId_idx" ON "BroadcastDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastDismissal_announcementId_userId_key" ON "BroadcastDismissal"("announcementId", "userId");

-- CreateIndex
CREATE INDEX "TenantAppAccess_tenantId_idx" ON "TenantAppAccess"("tenantId");

-- CreateIndex
CREATE INDEX "TenantAppAccess_appId_idx" ON "TenantAppAccess"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantAppAccess_tenantId_appId_key" ON "TenantAppAccess"("tenantId", "appId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE INDEX "Plan_slug_idx" ON "Plan"("slug");

-- CreateIndex
CREATE INDEX "Plan_isActive_idx" ON "Plan"("isActive");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_createdAt_idx" ON "Invoice"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_periodEnd_idx" ON "Invoice"("periodEnd");

-- AddForeignKey
ALTER TABLE "AppHealthCheck" ADD CONSTRAINT "AppHealthCheck_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastDismissal" ADD CONSTRAINT "BroadcastDismissal_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "BroadcastAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAppAccess" ADD CONSTRAINT "TenantAppAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAppAccess" ADD CONSTRAINT "TenantAppAccess_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


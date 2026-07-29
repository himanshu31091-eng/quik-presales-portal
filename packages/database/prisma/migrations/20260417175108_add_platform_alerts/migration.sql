-- CreateTable
CREATE TABLE "PlatformAlert" (
    "id" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "link" TEXT,
    "data" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformAlert_resolvedAt_idx" ON "PlatformAlert"("resolvedAt");

-- CreateIndex
CREATE INDEX "PlatformAlert_severity_lastSeenAt_idx" ON "PlatformAlert"("severity", "lastSeenAt");

-- CreateIndex
CREATE INDEX "PlatformAlert_rule_subjectKey_resolvedAt_idx" ON "PlatformAlert"("rule", "subjectKey", "resolvedAt");


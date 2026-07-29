-- AgentJwtIssuance: audit row written on every call to
-- POST /api/auth/internal/issue-agent-jwt (success and failure both).
--
-- Lives in the `auth` schema alongside User/VerificationToken because the
-- endpoint is owned by the central auth service.

CREATE TABLE "auth"."AgentJwtIssuance" (
    "id" TEXT NOT NULL,
    "requestingService" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT,
    "reason" TEXT NOT NULL,
    "ttlSeconds" INTEGER NOT NULL,
    "actingAs" TEXT NOT NULL,
    "traceId" TEXT,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentJwtIssuance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentJwtIssuance_userId_issuedAt_idx" ON "auth"."AgentJwtIssuance"("userId", "issuedAt");

CREATE INDEX "AgentJwtIssuance_requestingService_issuedAt_idx" ON "auth"."AgentJwtIssuance"("requestingService", "issuedAt");

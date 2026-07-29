-- QuikPreSales (app_quikpresales)
--
-- Purely additive: creates a new schema namespace and its tables. No existing
-- table, column, index or constraint is altered, so no other app is affected.
--
-- AppRole / UserAppRole / RolePermission are the physical names required by the
-- generic role-sync SQL in packages/auth/assign-app-roles.ts. They live inside
-- app_quikpresales and do not collide with the identically-named tables in
-- quikit / app_quiktrack / other app schemas.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app_quikpresales";

-- CreateTable
CREATE TABLE "app_quikpresales"."PsEngagement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "crmOpportunityId" TEXT,
    "crmAccountId" TEXT,
    "crmLeadId" TEXT,
    "title" TEXT NOT NULL,
    "industry" TEXT,
    "territory" TEXT,
    "salesOwnerId" TEXT,
    "presalesOwnerId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'qualification',
    "closedStatus" TEXT NOT NULL DEFAULT 'open',
    "estRevenue" BIGINT,
    "currency" TEXT DEFAULT 'INR',
    "probability" INTEGER NOT NULL DEFAULT 10,
    "competitors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "techStack" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expectedClose" TIMESTAMP(3),
    "riskScore" INTEGER,
    "aiDealHealth" TEXT,
    "dealHealthUpdatedAt" TIMESTAMP(3),
    "daysInStage" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "PsEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsTimelineEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PsTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsDocument" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'under-review',
    "rejectReason" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PsDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsRfp" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "sourceDocId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "extractedText" TEXT,
    "extractError" TEXT,
    "dueDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "PsRfp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsRfpRequirement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "rfpId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT,
    "citation" JSONB,
    "complianceStatus" TEXT NOT NULL DEFAULT 'clarify',
    "responseText" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PsRfpRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsProposal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "rfpId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currentVersionId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "PsProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsProposalVersion" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sections" JSONB NOT NULL,
    "changeNote" TEXT,
    "source" TEXT NOT NULL DEFAULT 'edit',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PsProposalVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsTemplate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content" JSONB NOT NULL,
    "industry" TEXT,
    "technology" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "PsTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsDemo" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "technology" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "blobUrl" TEXT,
    "recordingUrl" TEXT,
    "scriptDocId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "feedbackScore" DOUBLE PRECISION,
    "feedbackCount" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "PsDemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsKnowledgeAsset" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "blobUrl" TEXT,
    "industry" TEXT,
    "technology" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchText" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "PsKnowledgeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsCostEstimate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "totalAmount" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "assumptions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "PsCostEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsEstimateLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "role" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "rate" BIGINT NOT NULL DEFAULT 0,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PsEstimateLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsWinLoss" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "competitor" TEXT,
    "reasonCategory" TEXT,
    "reasonText" TEXT,
    "lessons" TEXT,
    "dealSize" BIGINT,
    "capturedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PsWinLoss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsPoc" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "scope" TEXT,
    "successCriteria" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'planned',
    "budget" BIGINT,
    "assignedTeam" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qtProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PsPoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."AppRole" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."UserAppRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "UserAppRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."RolePermission" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikpresales"."PsAuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'ok',
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PsAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PsEngagement_orgId_idx" ON "app_quikpresales"."PsEngagement"("orgId");

-- CreateIndex
CREATE INDEX "PsEngagement_orgId_stage_idx" ON "app_quikpresales"."PsEngagement"("orgId", "stage");

-- CreateIndex
CREATE INDEX "PsEngagement_orgId_presalesOwnerId_idx" ON "app_quikpresales"."PsEngagement"("orgId", "presalesOwnerId");

-- CreateIndex
CREATE INDEX "PsEngagement_orgId_deletedAt_idx" ON "app_quikpresales"."PsEngagement"("orgId", "deletedAt");

-- CreateIndex
CREATE INDEX "PsEngagement_orgId_crmOpportunityId_idx" ON "app_quikpresales"."PsEngagement"("orgId", "crmOpportunityId");

-- CreateIndex
CREATE INDEX "PsTimelineEvent_orgId_idx" ON "app_quikpresales"."PsTimelineEvent"("orgId");

-- CreateIndex
CREATE INDEX "PsTimelineEvent_orgId_engagementId_createdAt_idx" ON "app_quikpresales"."PsTimelineEvent"("orgId", "engagementId", "createdAt");

-- CreateIndex
CREATE INDEX "PsTimelineEvent_orgId_type_idx" ON "app_quikpresales"."PsTimelineEvent"("orgId", "type");

-- CreateIndex
CREATE INDEX "PsDocument_orgId_idx" ON "app_quikpresales"."PsDocument"("orgId");

-- CreateIndex
CREATE INDEX "PsDocument_orgId_engagementId_idx" ON "app_quikpresales"."PsDocument"("orgId", "engagementId");

-- CreateIndex
CREATE INDEX "PsDocument_orgId_status_idx" ON "app_quikpresales"."PsDocument"("orgId", "status");

-- CreateIndex
CREATE INDEX "PsRfp_orgId_idx" ON "app_quikpresales"."PsRfp"("orgId");

-- CreateIndex
CREATE INDEX "PsRfp_orgId_engagementId_idx" ON "app_quikpresales"."PsRfp"("orgId", "engagementId");

-- CreateIndex
CREATE INDEX "PsRfp_orgId_status_idx" ON "app_quikpresales"."PsRfp"("orgId", "status");

-- CreateIndex
CREATE INDEX "PsRfpRequirement_orgId_idx" ON "app_quikpresales"."PsRfpRequirement"("orgId");

-- CreateIndex
CREATE INDEX "PsRfpRequirement_orgId_rfpId_idx" ON "app_quikpresales"."PsRfpRequirement"("orgId", "rfpId");

-- CreateIndex
CREATE INDEX "PsRfpRequirement_orgId_rfpId_complianceStatus_idx" ON "app_quikpresales"."PsRfpRequirement"("orgId", "rfpId", "complianceStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PsProposal_currentVersionId_key" ON "app_quikpresales"."PsProposal"("currentVersionId");

-- CreateIndex
CREATE INDEX "PsProposal_orgId_idx" ON "app_quikpresales"."PsProposal"("orgId");

-- CreateIndex
CREATE INDEX "PsProposal_orgId_engagementId_idx" ON "app_quikpresales"."PsProposal"("orgId", "engagementId");

-- CreateIndex
CREATE INDEX "PsProposal_orgId_status_idx" ON "app_quikpresales"."PsProposal"("orgId", "status");

-- CreateIndex
CREATE INDEX "PsProposalVersion_orgId_idx" ON "app_quikpresales"."PsProposalVersion"("orgId");

-- CreateIndex
CREATE INDEX "PsProposalVersion_orgId_proposalId_idx" ON "app_quikpresales"."PsProposalVersion"("orgId", "proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "PsProposalVersion_proposalId_version_key" ON "app_quikpresales"."PsProposalVersion"("proposalId", "version");

-- CreateIndex
CREATE INDEX "PsTemplate_orgId_idx" ON "app_quikpresales"."PsTemplate"("orgId");

-- CreateIndex
CREATE INDEX "PsTemplate_orgId_kind_idx" ON "app_quikpresales"."PsTemplate"("orgId", "kind");

-- CreateIndex
CREATE INDEX "PsTemplate_orgId_industry_idx" ON "app_quikpresales"."PsTemplate"("orgId", "industry");

-- CreateIndex
CREATE INDEX "PsTemplate_orgId_deletedAt_idx" ON "app_quikpresales"."PsTemplate"("orgId", "deletedAt");

-- CreateIndex
CREATE INDEX "PsDemo_orgId_idx" ON "app_quikpresales"."PsDemo"("orgId");

-- CreateIndex
CREATE INDEX "PsDemo_orgId_industry_technology_idx" ON "app_quikpresales"."PsDemo"("orgId", "industry", "technology");

-- CreateIndex
CREATE INDEX "PsDemo_orgId_status_idx" ON "app_quikpresales"."PsDemo"("orgId", "status");

-- CreateIndex
CREATE INDEX "PsDemo_orgId_deletedAt_idx" ON "app_quikpresales"."PsDemo"("orgId", "deletedAt");

-- CreateIndex
CREATE INDEX "PsKnowledgeAsset_orgId_idx" ON "app_quikpresales"."PsKnowledgeAsset"("orgId");

-- CreateIndex
CREATE INDEX "PsKnowledgeAsset_orgId_kind_idx" ON "app_quikpresales"."PsKnowledgeAsset"("orgId", "kind");

-- CreateIndex
CREATE INDEX "PsKnowledgeAsset_orgId_industry_idx" ON "app_quikpresales"."PsKnowledgeAsset"("orgId", "industry");

-- CreateIndex
CREATE INDEX "PsKnowledgeAsset_orgId_deletedAt_idx" ON "app_quikpresales"."PsKnowledgeAsset"("orgId", "deletedAt");

-- CreateIndex
CREATE INDEX "PsCostEstimate_orgId_idx" ON "app_quikpresales"."PsCostEstimate"("orgId");

-- CreateIndex
CREATE INDEX "PsCostEstimate_orgId_engagementId_idx" ON "app_quikpresales"."PsCostEstimate"("orgId", "engagementId");

-- CreateIndex
CREATE INDEX "PsEstimateLine_orgId_idx" ON "app_quikpresales"."PsEstimateLine"("orgId");

-- CreateIndex
CREATE INDEX "PsEstimateLine_orgId_estimateId_idx" ON "app_quikpresales"."PsEstimateLine"("orgId", "estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "PsWinLoss_engagementId_key" ON "app_quikpresales"."PsWinLoss"("engagementId");

-- CreateIndex
CREATE INDEX "PsWinLoss_orgId_idx" ON "app_quikpresales"."PsWinLoss"("orgId");

-- CreateIndex
CREATE INDEX "PsWinLoss_orgId_outcome_idx" ON "app_quikpresales"."PsWinLoss"("orgId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "PsPoc_engagementId_key" ON "app_quikpresales"."PsPoc"("engagementId");

-- CreateIndex
CREATE INDEX "PsPoc_orgId_idx" ON "app_quikpresales"."PsPoc"("orgId");

-- CreateIndex
CREATE INDEX "PsPoc_orgId_engagementId_idx" ON "app_quikpresales"."PsPoc"("orgId", "engagementId");

-- CreateIndex
CREATE INDEX "PsPoc_orgId_status_idx" ON "app_quikpresales"."PsPoc"("orgId", "status");

-- CreateIndex
CREATE INDEX "AppRole_orgId_idx" ON "app_quikpresales"."AppRole"("orgId");

-- CreateIndex
CREATE INDEX "AppRole_orgId_appId_idx" ON "app_quikpresales"."AppRole"("orgId", "appId");

-- CreateIndex
CREATE UNIQUE INDEX "AppRole_orgId_appId_name_key" ON "app_quikpresales"."AppRole"("orgId", "appId", "name");

-- CreateIndex
CREATE INDEX "UserAppRole_roleId_idx" ON "app_quikpresales"."UserAppRole"("roleId");

-- CreateIndex
CREATE INDEX "UserAppRole_userId_orgId_idx" ON "app_quikpresales"."UserAppRole"("userId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAppRole_userId_orgId_roleId_key" ON "app_quikpresales"."UserAppRole"("userId", "orgId", "roleId");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "app_quikpresales"."RolePermission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_resource_action_key" ON "app_quikpresales"."RolePermission"("roleId", "resource", "action");

-- CreateIndex
CREATE INDEX "PsAuditLog_orgId_createdAt_idx" ON "app_quikpresales"."PsAuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "PsAuditLog_orgId_action_createdAt_idx" ON "app_quikpresales"."PsAuditLog"("orgId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "PsAuditLog_orgId_userId_createdAt_idx" ON "app_quikpresales"."PsAuditLog"("orgId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsEngagement" ADD CONSTRAINT "PsEngagement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsTimelineEvent" ADD CONSTRAINT "PsTimelineEvent_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "app_quikpresales"."PsEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsTimelineEvent" ADD CONSTRAINT "PsTimelineEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsDocument" ADD CONSTRAINT "PsDocument_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "app_quikpresales"."PsEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsDocument" ADD CONSTRAINT "PsDocument_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsRfp" ADD CONSTRAINT "PsRfp_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "app_quikpresales"."PsEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsRfp" ADD CONSTRAINT "PsRfp_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsRfpRequirement" ADD CONSTRAINT "PsRfpRequirement_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "app_quikpresales"."PsRfp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsRfpRequirement" ADD CONSTRAINT "PsRfpRequirement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsProposal" ADD CONSTRAINT "PsProposal_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "app_quikpresales"."PsEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsProposal" ADD CONSTRAINT "PsProposal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsProposal" ADD CONSTRAINT "PsProposal_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "app_quikpresales"."PsProposalVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsProposalVersion" ADD CONSTRAINT "PsProposalVersion_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "app_quikpresales"."PsProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsProposalVersion" ADD CONSTRAINT "PsProposalVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsTemplate" ADD CONSTRAINT "PsTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsDemo" ADD CONSTRAINT "PsDemo_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsKnowledgeAsset" ADD CONSTRAINT "PsKnowledgeAsset_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsCostEstimate" ADD CONSTRAINT "PsCostEstimate_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "app_quikpresales"."PsEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsCostEstimate" ADD CONSTRAINT "PsCostEstimate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsEstimateLine" ADD CONSTRAINT "PsEstimateLine_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "app_quikpresales"."PsCostEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsEstimateLine" ADD CONSTRAINT "PsEstimateLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsWinLoss" ADD CONSTRAINT "PsWinLoss_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "app_quikpresales"."PsEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsWinLoss" ADD CONSTRAINT "PsWinLoss_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsPoc" ADD CONSTRAINT "PsPoc_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "app_quikpresales"."PsEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsPoc" ADD CONSTRAINT "PsPoc_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."AppRole" ADD CONSTRAINT "AppRole_appId_fkey" FOREIGN KEY ("appId") REFERENCES "quikit"."App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."AppRole" ADD CONSTRAINT "AppRole_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."UserAppRole" ADD CONSTRAINT "UserAppRole_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."UserAppRole" ADD CONSTRAINT "UserAppRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikpresales"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."UserAppRole" ADD CONSTRAINT "UserAppRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikpresales"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikpresales"."PsAuditLog" ADD CONSTRAINT "PsAuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;


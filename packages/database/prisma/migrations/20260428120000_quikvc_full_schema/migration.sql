-- QuikVC OS — full schema migration (Sprints 1-5b)
-- 28 tables + 75 indexes + foreign keys in app_quikvc schema
-- Apply against Neon dev branch first; production after smoke test.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app_quikvc";


-- CreateTable
CREATE TABLE "app_quikvc"."VCFundProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fundName" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "icVotingMode" TEXT NOT NULL DEFAULT 'single',
    "icQuorum" INTEGER NOT NULL DEFAULT 2,
    "icThreshold" TEXT NOT NULL DEFAULT 'simple-majority',
    "icVisibility" TEXT NOT NULL DEFAULT 'open',
    "thesis" TEXT,
    "dailyBriefHour" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCFundProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCVertical" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCVertical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCScoringCriterion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "verticalId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCScoringCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "verticalId" TEXT NOT NULL,
    "startupName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "website" TEXT,
    "sector" TEXT,
    "foundedYear" INTEGER,
    "teamSize" INTEGER,
    "description" TEXT,
    "fundingAsk" BIGINT,
    "loanType" TEXT,
    "tenureMonths" INTEGER,
    "purpose" TEXT,
    "formAnswers" JSONB,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCDeal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "verticalId" TEXT NOT NULL,
    "currentStage" TEXT NOT NULL DEFAULT 'intake',
    "closedStatus" TEXT NOT NULL DEFAULT 'open',
    "analystId" TEXT,
    "partnerId" TEXT,
    "aiScore" INTEGER,
    "analystScore" INTEGER,
    "allocatedAmount" BIGINT NOT NULL DEFAULT 0,
    "docCompleteness" INTEGER NOT NULL DEFAULT 0,
    "daysInStage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCTimelineEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VCTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCDealDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
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
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCDealDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCDealQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "askedById" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCDealQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCDealScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "criterionSlug" TEXT NOT NULL,
    "aiScore" INTEGER,
    "analystScore" INTEGER,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCDealScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCDealSignal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mitigation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCDealSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCICMemo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCICMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCICMemoVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memoId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sections" JSONB NOT NULL,
    "changeNote" TEXT,
    "source" TEXT NOT NULL DEFAULT 'analyst-edit',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "VCICMemoVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCComparableCompany" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reason" TEXT,
    "metrics" JSONB,
    "link" TEXT,
    "pinnedAsBenchmark" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCComparableCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCMeeting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "meetingUrl" TEXT,
    "type" TEXT NOT NULL DEFAULT 'discovery-call',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "participants" JSONB,
    "agenda" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCMeetingTranscript" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "analysis" JSONB,
    "status" TEXT NOT NULL DEFAULT 'raw',
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VCMeetingTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCICVote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memoId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT,
    "conditions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VCICVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCInvestor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'lp',
    "userId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "kycStatus" TEXT NOT NULL DEFAULT 'pending',
    "accountClass" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCInvestor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCCommitment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'one-shot',
    "totalAmount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "vintageYear" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCCapitalCall" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "allocationId" TEXT,
    "amount" BIGINT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "paidAmount" BIGINT NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCCapitalCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCCapitalCallPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "capitalCallId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "VCCapitalCallPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCDealAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "disbursedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCDealAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCRepaymentSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "totalExpected" BIGINT NOT NULL,
    "totalPaid" BIGINT NOT NULL DEFAULT 0,
    "scheduleJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCRepaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCRepaymentPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'principal',
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "VCRepaymentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCTermSheetTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Term Sheet',
    "bodyHtml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCTermSheetTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCTermSheet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "renderedBodyHtml" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCTermSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCSourcedOpportunity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "startupName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "website" TEXT,
    "fundingAsk" BIGINT,
    "pitch" TEXT,
    "verticalId" TEXT,
    "thesisFitScore" INTEGER,
    "thesisFitReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "convertedApplicationId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "VCSourcedOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VCNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikvc"."VCAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'ok',
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VCAuditLog_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE UNIQUE INDEX "VCFundProfile_tenantId_key" ON "app_quikvc"."VCFundProfile"("tenantId");

-- CreateIndex
CREATE INDEX "VCVertical_tenantId_idx" ON "app_quikvc"."VCVertical"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "VCVertical_tenantId_slug_key" ON "app_quikvc"."VCVertical"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "VCScoringCriterion_tenantId_verticalId_idx" ON "app_quikvc"."VCScoringCriterion"("tenantId", "verticalId");

-- CreateIndex
CREATE UNIQUE INDEX "VCScoringCriterion_tenantId_verticalId_slug_key" ON "app_quikvc"."VCScoringCriterion"("tenantId", "verticalId", "slug");

-- CreateIndex
CREATE INDEX "VCApplication_tenantId_idx" ON "app_quikvc"."VCApplication"("tenantId");

-- CreateIndex
CREATE INDEX "VCApplication_tenantId_founderId_idx" ON "app_quikvc"."VCApplication"("tenantId", "founderId");

-- CreateIndex
CREATE INDEX "VCApplication_tenantId_status_idx" ON "app_quikvc"."VCApplication"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VCDeal_applicationId_key" ON "app_quikvc"."VCDeal"("applicationId");

-- CreateIndex
CREATE INDEX "VCDeal_tenantId_idx" ON "app_quikvc"."VCDeal"("tenantId");

-- CreateIndex
CREATE INDEX "VCDeal_tenantId_currentStage_idx" ON "app_quikvc"."VCDeal"("tenantId", "currentStage");

-- CreateIndex
CREATE INDEX "VCDeal_tenantId_verticalId_idx" ON "app_quikvc"."VCDeal"("tenantId", "verticalId");

-- CreateIndex
CREATE INDEX "VCDeal_tenantId_analystId_idx" ON "app_quikvc"."VCDeal"("tenantId", "analystId");

-- CreateIndex
CREATE INDEX "VCTimelineEvent_tenantId_dealId_createdAt_idx" ON "app_quikvc"."VCTimelineEvent"("tenantId", "dealId", "createdAt");

-- CreateIndex
CREATE INDEX "VCTimelineEvent_tenantId_type_idx" ON "app_quikvc"."VCTimelineEvent"("tenantId", "type");

-- CreateIndex
CREATE INDEX "VCDealDocument_tenantId_dealId_idx" ON "app_quikvc"."VCDealDocument"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "VCDealDocument_tenantId_status_idx" ON "app_quikvc"."VCDealDocument"("tenantId", "status");

-- CreateIndex
CREATE INDEX "VCDealQuestion_tenantId_dealId_status_idx" ON "app_quikvc"."VCDealQuestion"("tenantId", "dealId", "status");

-- CreateIndex
CREATE INDEX "VCDealScore_tenantId_dealId_idx" ON "app_quikvc"."VCDealScore"("tenantId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "VCDealScore_tenantId_dealId_criterionSlug_key" ON "app_quikvc"."VCDealScore"("tenantId", "dealId", "criterionSlug");

-- CreateIndex
CREATE INDEX "VCDealSignal_tenantId_dealId_status_idx" ON "app_quikvc"."VCDealSignal"("tenantId", "dealId", "status");

-- CreateIndex
CREATE INDEX "VCDealSignal_tenantId_severity_idx" ON "app_quikvc"."VCDealSignal"("tenantId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "VCICMemo_dealId_key" ON "app_quikvc"."VCICMemo"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "VCICMemo_currentVersionId_key" ON "app_quikvc"."VCICMemo"("currentVersionId");

-- CreateIndex
CREATE INDEX "VCICMemo_tenantId_idx" ON "app_quikvc"."VCICMemo"("tenantId");

-- CreateIndex
CREATE INDEX "VCICMemoVersion_tenantId_memoId_idx" ON "app_quikvc"."VCICMemoVersion"("tenantId", "memoId");

-- CreateIndex
CREATE UNIQUE INDEX "VCICMemoVersion_memoId_version_key" ON "app_quikvc"."VCICMemoVersion"("memoId", "version");

-- CreateIndex
CREATE INDEX "VCComparableCompany_tenantId_dealId_idx" ON "app_quikvc"."VCComparableCompany"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "VCMeeting_tenantId_dealId_idx" ON "app_quikvc"."VCMeeting"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "VCMeeting_tenantId_status_idx" ON "app_quikvc"."VCMeeting"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VCMeetingTranscript_meetingId_key" ON "app_quikvc"."VCMeetingTranscript"("meetingId");

-- CreateIndex
CREATE INDEX "VCMeetingTranscript_tenantId_idx" ON "app_quikvc"."VCMeetingTranscript"("tenantId");

-- CreateIndex
CREATE INDEX "VCICVote_tenantId_memoId_idx" ON "app_quikvc"."VCICVote"("tenantId", "memoId");

-- CreateIndex
CREATE UNIQUE INDEX "VCICVote_memoId_voterId_key" ON "app_quikvc"."VCICVote"("memoId", "voterId");

-- CreateIndex
CREATE INDEX "VCInvestor_tenantId_idx" ON "app_quikvc"."VCInvestor"("tenantId");

-- CreateIndex
CREATE INDEX "VCInvestor_tenantId_type_idx" ON "app_quikvc"."VCInvestor"("tenantId", "type");

-- CreateIndex
CREATE INDEX "VCCommitment_tenantId_investorId_idx" ON "app_quikvc"."VCCommitment"("tenantId", "investorId");

-- CreateIndex
CREATE INDEX "VCCapitalCall_tenantId_investorId_status_idx" ON "app_quikvc"."VCCapitalCall"("tenantId", "investorId", "status");

-- CreateIndex
CREATE INDEX "VCCapitalCall_tenantId_dueDate_idx" ON "app_quikvc"."VCCapitalCall"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "VCCapitalCallPayment_tenantId_capitalCallId_idx" ON "app_quikvc"."VCCapitalCallPayment"("tenantId", "capitalCallId");

-- CreateIndex
CREATE INDEX "VCDealAllocation_tenantId_dealId_idx" ON "app_quikvc"."VCDealAllocation"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "VCDealAllocation_tenantId_investorId_idx" ON "app_quikvc"."VCDealAllocation"("tenantId", "investorId");

-- CreateIndex
CREATE UNIQUE INDEX "VCDealAllocation_dealId_investorId_key" ON "app_quikvc"."VCDealAllocation"("dealId", "investorId");

-- CreateIndex
CREATE INDEX "VCRepaymentSchedule_tenantId_dealId_idx" ON "app_quikvc"."VCRepaymentSchedule"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "VCRepaymentSchedule_tenantId_investorId_idx" ON "app_quikvc"."VCRepaymentSchedule"("tenantId", "investorId");

-- CreateIndex
CREATE INDEX "VCRepaymentPayment_tenantId_scheduleId_idx" ON "app_quikvc"."VCRepaymentPayment"("tenantId", "scheduleId");

-- CreateIndex
CREATE INDEX "VCRepaymentPayment_tenantId_investorId_paidAt_idx" ON "app_quikvc"."VCRepaymentPayment"("tenantId", "investorId", "paidAt");

-- CreateIndex
CREATE INDEX "VCTermSheetTemplate_tenantId_idx" ON "app_quikvc"."VCTermSheetTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "VCTermSheetTemplate_tenantId_name_key" ON "app_quikvc"."VCTermSheetTemplate"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "VCTermSheet_dealId_key" ON "app_quikvc"."VCTermSheet"("dealId");

-- CreateIndex
CREATE INDEX "VCTermSheet_tenantId_idx" ON "app_quikvc"."VCTermSheet"("tenantId");

-- CreateIndex
CREATE INDEX "VCSourcedOpportunity_tenantId_status_idx" ON "app_quikvc"."VCSourcedOpportunity"("tenantId", "status");

-- CreateIndex
CREATE INDEX "VCSourcedOpportunity_tenantId_createdAt_idx" ON "app_quikvc"."VCSourcedOpportunity"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "VCNotification_tenantId_userId_readAt_idx" ON "app_quikvc"."VCNotification"("tenantId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "VCNotification_tenantId_userId_createdAt_idx" ON "app_quikvc"."VCNotification"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "VCAuditLog_tenantId_createdAt_idx" ON "app_quikvc"."VCAuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "VCAuditLog_tenantId_action_createdAt_idx" ON "app_quikvc"."VCAuditLog"("tenantId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "VCAuditLog_tenantId_userId_createdAt_idx" ON "app_quikvc"."VCAuditLog"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "VCAuditLog_tenantId_outcome_createdAt_idx" ON "app_quikvc"."VCAuditLog"("tenantId", "outcome", "createdAt");

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCFundProfile" ADD CONSTRAINT "VCFundProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCVertical" ADD CONSTRAINT "VCVertical_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCScoringCriterion" ADD CONSTRAINT "VCScoringCriterion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCScoringCriterion" ADD CONSTRAINT "VCScoringCriterion_verticalId_fkey" FOREIGN KEY ("verticalId") REFERENCES "app_quikvc"."VCVertical"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCApplication" ADD CONSTRAINT "VCApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCApplication" ADD CONSTRAINT "VCApplication_verticalId_fkey" FOREIGN KEY ("verticalId") REFERENCES "app_quikvc"."VCVertical"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDeal" ADD CONSTRAINT "VCDeal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDeal" ADD CONSTRAINT "VCDeal_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "app_quikvc"."VCApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDeal" ADD CONSTRAINT "VCDeal_verticalId_fkey" FOREIGN KEY ("verticalId") REFERENCES "app_quikvc"."VCVertical"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCTimelineEvent" ADD CONSTRAINT "VCTimelineEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCTimelineEvent" ADD CONSTRAINT "VCTimelineEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "app_quikvc"."VCDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDealDocument" ADD CONSTRAINT "VCDealDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDealDocument" ADD CONSTRAINT "VCDealDocument_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "app_quikvc"."VCDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDealQuestion" ADD CONSTRAINT "VCDealQuestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDealQuestion" ADD CONSTRAINT "VCDealQuestion_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "app_quikvc"."VCDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDealScore" ADD CONSTRAINT "VCDealScore_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDealScore" ADD CONSTRAINT "VCDealScore_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "app_quikvc"."VCDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDealSignal" ADD CONSTRAINT "VCDealSignal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDealSignal" ADD CONSTRAINT "VCDealSignal_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "app_quikvc"."VCDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCICMemo" ADD CONSTRAINT "VCICMemo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCICMemo" ADD CONSTRAINT "VCICMemo_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "app_quikvc"."VCDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCICMemo" ADD CONSTRAINT "VCICMemo_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "app_quikvc"."VCICMemoVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCICMemoVersion" ADD CONSTRAINT "VCICMemoVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCICMemoVersion" ADD CONSTRAINT "VCICMemoVersion_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "app_quikvc"."VCICMemo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCComparableCompany" ADD CONSTRAINT "VCComparableCompany_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCComparableCompany" ADD CONSTRAINT "VCComparableCompany_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "app_quikvc"."VCDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCMeeting" ADD CONSTRAINT "VCMeeting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCMeeting" ADD CONSTRAINT "VCMeeting_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "app_quikvc"."VCDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCMeetingTranscript" ADD CONSTRAINT "VCMeetingTranscript_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCMeetingTranscript" ADD CONSTRAINT "VCMeetingTranscript_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "app_quikvc"."VCMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCICVote" ADD CONSTRAINT "VCICVote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCICVote" ADD CONSTRAINT "VCICVote_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "app_quikvc"."VCICMemo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCInvestor" ADD CONSTRAINT "VCInvestor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCCommitment" ADD CONSTRAINT "VCCommitment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCCommitment" ADD CONSTRAINT "VCCommitment_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "app_quikvc"."VCInvestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCCapitalCall" ADD CONSTRAINT "VCCapitalCall_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCCapitalCall" ADD CONSTRAINT "VCCapitalCall_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "app_quikvc"."VCInvestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCCapitalCallPayment" ADD CONSTRAINT "VCCapitalCallPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCCapitalCallPayment" ADD CONSTRAINT "VCCapitalCallPayment_capitalCallId_fkey" FOREIGN KEY ("capitalCallId") REFERENCES "app_quikvc"."VCCapitalCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDealAllocation" ADD CONSTRAINT "VCDealAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDealAllocation" ADD CONSTRAINT "VCDealAllocation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "app_quikvc"."VCDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCDealAllocation" ADD CONSTRAINT "VCDealAllocation_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "app_quikvc"."VCInvestor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCRepaymentSchedule" ADD CONSTRAINT "VCRepaymentSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCRepaymentSchedule" ADD CONSTRAINT "VCRepaymentSchedule_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "app_quikvc"."VCInvestor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCRepaymentPayment" ADD CONSTRAINT "VCRepaymentPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCRepaymentPayment" ADD CONSTRAINT "VCRepaymentPayment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "app_quikvc"."VCRepaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCRepaymentPayment" ADD CONSTRAINT "VCRepaymentPayment_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "app_quikvc"."VCInvestor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCTermSheetTemplate" ADD CONSTRAINT "VCTermSheetTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCTermSheet" ADD CONSTRAINT "VCTermSheet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCTermSheet" ADD CONSTRAINT "VCTermSheet_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "app_quikvc"."VCDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCSourcedOpportunity" ADD CONSTRAINT "VCSourcedOpportunity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCSourcedOpportunity" ADD CONSTRAINT "VCSourcedOpportunity_verticalId_fkey" FOREIGN KEY ("verticalId") REFERENCES "app_quikvc"."VCVertical"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCNotification" ADD CONSTRAINT "VCNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikvc"."VCAuditLog" ADD CONSTRAINT "VCAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

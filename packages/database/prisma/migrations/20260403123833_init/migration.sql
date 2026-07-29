-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "fiscalYearStart" INTEGER NOT NULL DEFAULT 1,
    "quarterStartMonth" INTEGER NOT NULL DEFAULT 1,
    "weekStartDay" INTEGER NOT NULL DEFAULT 1,
    "logoUrl" TEXT,
    "brandColor" TEXT DEFAULT '#0066cc',
    "plan" TEXT NOT NULL DEFAULT 'startup',
    "billingEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "password" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSignInAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "access_token" TEXT,
    "token_type" TEXT,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "teamId" TEXT,
    "customPermissions" TEXT[],
    "invitationToken" TEXT,
    "invitedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "parentTeamId" TEXT,
    "headId" TEXT,
    "color" TEXT DEFAULT '#0066cc',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountabilityFunction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "teamId" TEXT,
    "parentFunctionId" TEXT,
    "assignedToUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountabilityFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KPI" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner" TEXT NOT NULL,
    "teamId" TEXT,
    "parentKPIId" TEXT,
    "quarter" TEXT NOT NULL DEFAULT 'Q1',
    "year" INTEGER NOT NULL,
    "measurementUnit" TEXT NOT NULL,
    "target" DOUBLE PRECISION,
    "quarterlyGoal" DOUBLE PRECISION,
    "qtdGoal" DOUBLE PRECISION,
    "qtdAchieved" DOUBLE PRECISION,
    "currentWeekValue" DOUBLE PRECISION,
    "progressPercent" DOUBLE PRECISION DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "healthStatus" TEXT NOT NULL DEFAULT 'on-track',
    "lastNotes" TEXT,
    "lastNotesAt" TIMESTAMP(3),
    "lastNotedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "KPI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KPIWeeklyValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "value" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "KPIWeeklyValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KPINote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KPINote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KPILog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KPILog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Priority" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner" TEXT NOT NULL,
    "teamId" TEXT,
    "quarter" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "startWeek" INTEGER,
    "endWeek" INTEGER,
    "overallStatus" TEXT NOT NULL DEFAULT 'not-started',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Priority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriorityWeeklyStatus" (
    "id" TEXT NOT NULL,
    "priorityId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "PriorityWeeklyStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WWWItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "what" TEXT NOT NULL,
    "when" TIMESTAMP(3) NOT NULL,
    "createdInMeetingId" TEXT,
    "linkedPriorityId" TEXT,
    "linkedKPIId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not-started',
    "notes" TEXT,
    "originalDueDate" TIMESTAMP(3),
    "revisedDates" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "WWWItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WWWRevisionLog" (
    "id" TEXT NOT NULL,
    "wwwItemId" TEXT NOT NULL,
    "oldDueDate" TIMESTAMP(3) NOT NULL,
    "newDueDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "changedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WWWRevisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "location" TEXT,
    "meetingLink" TEXT,
    "agenda" TEXT,
    "decisions" TEXT,
    "blockers" TEXT,
    "highlights" TEXT,
    "startedOnTime" BOOLEAN NOT NULL DEFAULT false,
    "endedOnTime" BOOLEAN NOT NULL DEFAULT false,
    "formatFollowed" BOOLEAN NOT NULL DEFAULT false,
    "followUpRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "description" TEXT,
    "sections" TEXT[],
    "defaultAttendees" TEXT[],
    "duration" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "MeetingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendee" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "attendedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingMetric" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OPSPDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "OPSPDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OPSPSection" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sectionType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "notes" TEXT,
    "stakeholderType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "OPSPSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OPSPPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "relationships_long" TEXT,
    "relationships_1yr" TEXT,
    "relationships_90d" TEXT,
    "achievements_long" TEXT,
    "achievements_1yr" TEXT,
    "achievements_90d" TEXT,
    "rituals_long" TEXT,
    "rituals_1yr" TEXT,
    "rituals_90d" TEXT,
    "wealth_long" TEXT,
    "wealth_1yr" TEXT,
    "wealth_90d" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OPSPPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitAssessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL,
    "quarter" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "habit1_vision" INTEGER NOT NULL,
    "habit2_meetings" INTEGER NOT NULL,
    "habit3_scoreboards" INTEGER NOT NULL,
    "habit4_accountable" INTEGER NOT NULL,
    "habit5_rhythm" INTEGER NOT NULL,
    "habit6_sticking" INTEGER NOT NULL,
    "habit7_cascading" INTEGER NOT NULL,
    "habit8_recognition" INTEGER NOT NULL,
    "habit9_training" INTEGER NOT NULL,
    "habit10_innovation" INTEGER NOT NULL,
    "averageScore" DOUBLE PRECISION,
    "maturityLevel" TEXT,
    "notes" TEXT,
    "assessedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "relatedEntityId" TEXT,
    "relatedEntityType" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValues" TEXT,
    "newValues" TEXT,
    "changes" TEXT[],
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercent" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_invitationToken_key" ON "Membership"("invitationToken");

-- CreateIndex
CREATE INDEX "Membership_tenantId_idx" ON "Membership"("tenantId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_teamId_idx" ON "Membership"("teamId");

-- CreateIndex
CREATE INDEX "Membership_role_idx" ON "Membership"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Team_tenantId_idx" ON "Team"("tenantId");

-- CreateIndex
CREATE INDEX "Team_parentTeamId_idx" ON "Team"("parentTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_tenantId_slug_key" ON "Team"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "AccountabilityFunction_tenantId_idx" ON "AccountabilityFunction"("tenantId");

-- CreateIndex
CREATE INDEX "AccountabilityFunction_assignedToUserId_idx" ON "AccountabilityFunction"("assignedToUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountabilityFunction_tenantId_name_key" ON "AccountabilityFunction"("tenantId", "name");

-- CreateIndex
CREATE INDEX "KPI_tenantId_idx" ON "KPI"("tenantId");

-- CreateIndex
CREATE INDEX "KPI_owner_idx" ON "KPI"("owner");

-- CreateIndex
CREATE INDEX "KPI_teamId_idx" ON "KPI"("teamId");

-- CreateIndex
CREATE INDEX "KPI_parentKPIId_idx" ON "KPI"("parentKPIId");

-- CreateIndex
CREATE INDEX "KPI_status_idx" ON "KPI"("status");

-- CreateIndex
CREATE INDEX "KPI_healthStatus_idx" ON "KPI"("healthStatus");

-- CreateIndex
CREATE INDEX "KPI_quarter_year_idx" ON "KPI"("quarter", "year");

-- CreateIndex
CREATE INDEX "KPIWeeklyValue_tenantId_idx" ON "KPIWeeklyValue"("tenantId");

-- CreateIndex
CREATE INDEX "KPIWeeklyValue_kpiId_idx" ON "KPIWeeklyValue"("kpiId");

-- CreateIndex
CREATE UNIQUE INDEX "KPIWeeklyValue_kpiId_weekNumber_key" ON "KPIWeeklyValue"("kpiId", "weekNumber");

-- CreateIndex
CREATE INDEX "KPINote_tenantId_idx" ON "KPINote"("tenantId");

-- CreateIndex
CREATE INDEX "KPINote_kpiId_idx" ON "KPINote"("kpiId");

-- CreateIndex
CREATE INDEX "KPINote_authorId_idx" ON "KPINote"("authorId");

-- CreateIndex
CREATE INDEX "KPILog_tenantId_idx" ON "KPILog"("tenantId");

-- CreateIndex
CREATE INDEX "KPILog_kpiId_idx" ON "KPILog"("kpiId");

-- CreateIndex
CREATE INDEX "KPILog_createdAt_idx" ON "KPILog"("createdAt");

-- CreateIndex
CREATE INDEX "Priority_tenantId_idx" ON "Priority"("tenantId");

-- CreateIndex
CREATE INDEX "Priority_owner_idx" ON "Priority"("owner");

-- CreateIndex
CREATE INDEX "Priority_teamId_idx" ON "Priority"("teamId");

-- CreateIndex
CREATE INDEX "Priority_quarter_year_idx" ON "Priority"("quarter", "year");

-- CreateIndex
CREATE INDEX "PriorityWeeklyStatus_priorityId_idx" ON "PriorityWeeklyStatus"("priorityId");

-- CreateIndex
CREATE UNIQUE INDEX "PriorityWeeklyStatus_priorityId_weekNumber_key" ON "PriorityWeeklyStatus"("priorityId", "weekNumber");

-- CreateIndex
CREATE INDEX "WWWItem_tenantId_idx" ON "WWWItem"("tenantId");

-- CreateIndex
CREATE INDEX "WWWItem_who_idx" ON "WWWItem"("who");

-- CreateIndex
CREATE INDEX "WWWItem_when_idx" ON "WWWItem"("when");

-- CreateIndex
CREATE INDEX "WWWItem_status_idx" ON "WWWItem"("status");

-- CreateIndex
CREATE INDEX "WWWItem_createdAt_idx" ON "WWWItem"("createdAt");

-- CreateIndex
CREATE INDEX "WWWRevisionLog_wwwItemId_idx" ON "WWWRevisionLog"("wwwItemId");

-- CreateIndex
CREATE INDEX "WWWRevisionLog_createdAt_idx" ON "WWWRevisionLog"("createdAt");

-- CreateIndex
CREATE INDEX "Meeting_tenantId_idx" ON "Meeting"("tenantId");

-- CreateIndex
CREATE INDEX "Meeting_cadence_idx" ON "Meeting"("cadence");

-- CreateIndex
CREATE INDEX "Meeting_scheduledAt_idx" ON "Meeting"("scheduledAt");

-- CreateIndex
CREATE INDEX "MeetingTemplate_tenantId_idx" ON "MeetingTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "MeetingAttendee_meetingId_idx" ON "MeetingAttendee"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendee_meetingId_userId_key" ON "MeetingAttendee"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "MeetingMetric_meetingId_idx" ON "MeetingMetric"("meetingId");

-- CreateIndex
CREATE INDEX "OPSPDocument_tenantId_idx" ON "OPSPDocument"("tenantId");

-- CreateIndex
CREATE INDEX "OPSPDocument_status_idx" ON "OPSPDocument"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OPSPDocument_tenantId_year_versionNumber_key" ON "OPSPDocument"("tenantId", "year", "versionNumber");

-- CreateIndex
CREATE INDEX "OPSPSection_documentId_idx" ON "OPSPSection"("documentId");

-- CreateIndex
CREATE INDEX "OPSPSection_sectionType_idx" ON "OPSPSection"("sectionType");

-- CreateIndex
CREATE UNIQUE INDEX "OPSPPlan_userId_key" ON "OPSPPlan"("userId");

-- CreateIndex
CREATE INDEX "OPSPPlan_tenantId_idx" ON "OPSPPlan"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OPSPPlan_tenantId_userId_key" ON "OPSPPlan"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "HabitAssessment_tenantId_idx" ON "HabitAssessment"("tenantId");

-- CreateIndex
CREATE INDEX "HabitAssessment_quarter_year_idx" ON "HabitAssessment"("quarter", "year");

-- CreateIndex
CREATE INDEX "HabitAssessment_assessmentDate_idx" ON "HabitAssessment"("assessmentDate");

-- CreateIndex
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "FeatureFlag_tenantId_idx" ON "FeatureFlag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_tenantId_key_key" ON "FeatureFlag"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_parentTeamId_fkey" FOREIGN KEY ("parentTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountabilityFunction" ADD CONSTRAINT "AccountabilityFunction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountabilityFunction" ADD CONSTRAINT "AccountabilityFunction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountabilityFunction" ADD CONSTRAINT "AccountabilityFunction_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountabilityFunction" ADD CONSTRAINT "AccountabilityFunction_parentFunctionId_fkey" FOREIGN KEY ("parentFunctionId") REFERENCES "AccountabilityFunction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPI" ADD CONSTRAINT "KPI_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPI" ADD CONSTRAINT "KPI_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPI" ADD CONSTRAINT "KPI_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPI" ADD CONSTRAINT "KPI_parentKPIId_fkey" FOREIGN KEY ("parentKPIId") REFERENCES "KPI"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIWeeklyValue" ADD CONSTRAINT "KPIWeeklyValue_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KPI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPINote" ADD CONSTRAINT "KPINote_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KPI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPINote" ADD CONSTRAINT "KPINote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPILog" ADD CONSTRAINT "KPILog_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KPI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Priority" ADD CONSTRAINT "Priority_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Priority" ADD CONSTRAINT "Priority_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Priority" ADD CONSTRAINT "Priority_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityWeeklyStatus" ADD CONSTRAINT "PriorityWeeklyStatus_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "Priority"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WWWItem" ADD CONSTRAINT "WWWItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WWWItem" ADD CONSTRAINT "WWWItem_createdInMeetingId_fkey" FOREIGN KEY ("createdInMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WWWRevisionLog" ADD CONSTRAINT "WWWRevisionLog_wwwItemId_fkey" FOREIGN KEY ("wwwItemId") REFERENCES "WWWItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MeetingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTemplate" ADD CONSTRAINT "MeetingTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingMetric" ADD CONSTRAINT "MeetingMetric_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OPSPDocument" ADD CONSTRAINT "OPSPDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OPSPSection" ADD CONSTRAINT "OPSPSection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OPSPDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OPSPPlan" ADD CONSTRAINT "OPSPPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OPSPPlan" ADD CONSTRAINT "OPSPPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitAssessment" ADD CONSTRAINT "HabitAssessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

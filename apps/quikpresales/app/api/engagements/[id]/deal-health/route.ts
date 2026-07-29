import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { STAGE_LABEL, type Stage } from "@/lib/pipeline";
import { assessDealHealth } from "@/lib/ai/prompts/deal-health";

const withEngagementAuth = withOrgAuthForModule("engagements");

/** One Sonnet call at low effort — seconds, not minutes. Declared anyway so the
 *  route never inherits the 15s platform default if the prompt grows. */
export const maxDuration = 60;

/** Timeline entries inside this window count as "recent activity". */
const ACTIVITY_WINDOW_DAYS = 14;

/**
 * POST /api/engagements/[id]/deal-health
 *
 * Recomputes AI deal health for one engagement and persists it to
 * `aiDealHealth` / `riskScore` / `dealHealthUpdatedAt`. Those columns already
 * existed and the dashboard already groups by `aiDealHealth` — until now nothing
 * wrote them, so that panel was permanently empty.
 *
 * Signals come entirely from this app's own schema. The narrative output
 * (rationale, risks, next actions) is returned to the caller and recorded on the
 * timeline, but not stored on the engagement: there is no column for it, and a
 * schema change is the integration owner's call.
 *
 * Deliberately synchronous. Unlike RFP extraction this is a single short call,
 * so there is no claim to take and nothing to wedge if the invocation dies.
 */
export const POST = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "engagements", "update");
    if (denied) return denied;

    const engagement = await db.psEngagement.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: {
        id: true,
        title: true,
        stage: true,
        closedStatus: true,
        industry: true,
        competitors: true,
        techStack: true,
        probability: true,
        estRevenue: true,
        currency: true,
        expectedClose: true,
        daysInStage: true,
      },
    });
    if (!engagement) return notFound("Engagement");

    // Scoring a closed deal is meaningless — the outcome is already known, and
    // writing a health flag onto it would pollute the dashboard breakdown.
    if (engagement.closedStatus !== "open") {
      return fail(409, `Engagement is ${engagement.closedStatus}; deal health only applies to open deals`);
    }

    const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 86_400_000);

    const [rfpCount, requirementCount, gapCount, proposalCount, latestProposal, recentActivityCount, lastActivity] =
      await Promise.all([
        db.psRfp.count({ where: { orgId, engagementId: engagement.id } }),
        db.psRfpRequirement.count({ where: { orgId, rfp: { engagementId: engagement.id } } }),
        db.psRfpRequirement.count({
          where: { orgId, rfp: { engagementId: engagement.id }, complianceStatus: "gap" },
        }),
        // PsProposal has no deletedAt — proposals are not soft-deleted, unlike
        // engagements and knowledge assets. Don't add a filter for it.
        db.psProposal.count({ where: { orgId, engagementId: engagement.id } }),
        db.psProposal.findFirst({
          where: { orgId, engagementId: engagement.id },
          select: { status: true },
          orderBy: { updatedAt: "desc" },
        }),
        db.psTimelineEvent.count({
          where: { orgId, engagementId: engagement.id, createdAt: { gte: since } },
        }),
        db.psTimelineEvent.findFirst({
          where: { orgId, engagementId: engagement.id },
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const assessment = await assessDealHealth({
      title: engagement.title,
      stage: engagement.stage,
      stageLabel: STAGE_LABEL[engagement.stage as Stage] ?? engagement.stage,
      daysInStage: engagement.daysInStage,
      industry: engagement.industry,
      competitors: engagement.competitors,
      techStack: engagement.techStack,
      probability: engagement.probability,
      // Stored as paise; the model reasons better about rupees.
      estRevenue: engagement.estRevenue === null ? null : Number(engagement.estRevenue) / 100,
      currency: engagement.currency,
      expectedClose: engagement.expectedClose,
      rfpCount,
      requirementCount,
      gapCount,
      proposalCount,
      latestProposalStatus: latestProposal?.status ?? null,
      recentActivityCount,
      daysSinceLastActivity:
        lastActivity === null
          ? null
          : Math.floor((Date.now() - lastActivity.createdAt.getTime()) / 86_400_000),
    });

    const assessedAt = new Date();

    await db.$transaction(async (tx) => {
      await tx.psEngagement.update({
        where: { id: engagement.id },
        data: {
          aiDealHealth: assessment.health,
          riskScore: assessment.riskScore,
          dealHealthUpdatedAt: assessedAt,
          updatedBy: userId,
        },
      });

      await writeTimeline(tx, {
        orgId,
        engagementId: engagement.id,
        type: "deal-health-assessed",
        actorId: userId,
        summary: `Deal health assessed as ${assessment.health} (risk ${assessment.riskScore}/100)`,
        // The narrative lives here because the engagement has no column for it.
        payload: {
          health: assessment.health,
          riskScore: assessment.riskScore,
          rationale: assessment.rationale,
          risks: assessment.risks,
          nextActions: assessment.nextActions,
          isStub: assessment.isStub,
        },
      });

      await writeAudit(tx, {
        orgId,
        userId,
        action: "engagement.deal_health",
        resource: engagement.id,
        metadata: {
          health: assessment.health,
          riskScore: assessment.riskScore,
          tokensUsed: assessment.tokensUsed,
          isStub: assessment.isStub,
        },
      });
    });

    return okSerialized({
      id: engagement.id,
      health: assessment.health,
      riskScore: assessment.riskScore,
      rationale: assessment.rationale,
      risks: assessment.risks,
      nextActions: assessment.nextActions,
      assessedAt: assessedAt.toISOString(),
      isStub: assessment.isStub,
    });
  },
);

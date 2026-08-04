import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { STAGE_LABEL, type Stage } from "@/lib/pipeline";
import { fromMinorUnits } from "@/lib/currency/currencies";
import { parseSections } from "@/lib/proposals/sections";
import { COPILOT_TASKS, runCopilot, type DealContext } from "@/lib/ai/prompts/copilot";

const withEngagementAuth = withOrgAuthForModule("engagements");

/** One Sonnet call at medium effort over a bounded context. */
export const maxDuration = 60;

/**
 * POST /api/engagements/[id]/copilot
 *
 * Answers a question or drafts an artefact for one deal, grounded strictly in what
 * the portal holds about it.
 *
 * The value is entirely in the context assembly below: the requirement brief,
 * every requirement and whether it was answered, proposal completeness, estimates,
 * demo outcomes, health and recent activity. Without that a copilot is a generic
 * chatbot; with it, it can answer "why is this deal stalled" from evidence.
 *
 * Audited but NOT written to the timeline. Asking a question is not an event in the
 * deal's history, and logging every one would bury the actual milestones — but AI
 * spend still needs attributing, which the audit row does.
 */

const copilotSchema = z
  .object({
    task: z.enum(COPILOT_TASKS),
    question: z.string().max(1000).optional(),
  })
  .refine((v) => v.task !== "ask" || (v.question ?? "").trim().length >= 3, {
    message: "A question is required for the ask task",
    path: ["question"],
  });

export const POST = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    // `view` not `update`: the copilot reads and drafts, it never mutates the deal.
    const denied = await requirePermission(userId, orgId, "engagements", "view");
    if (denied) return denied;

    const parsed = copilotSchema.safeParse((await req.json().catch(() => null)) ?? {});
    if (!parsed.success) return validationError(parsed.error);
    const { task, question } = parsed.data;

    const engagement = await db.psEngagement.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: {
        id: true,
        title: true,
        stage: true,
        daysInStage: true,
        industry: true,
        territory: true,
        competitors: true,
        techStack: true,
        probability: true,
        estRevenue: true,
        currency: true,
        expectedClose: true,
        aiDealHealth: true,
        riskScore: true,
        winLoss: { select: { outcome: true, reasonCategory: true, reasonText: true } },
      },
    });
    if (!engagement) return notFound("Engagement");

    const [rfps, proposals, estimates, events] = await Promise.all([
      db.psRfp.findMany({
        where: { orgId, engagementId: engagement.id },
        select: {
          extractedText: true,
          requirements: {
            select: { text: true, complianceStatus: true, responseText: true },
            orderBy: { sortOrder: "asc" },
            take: 40,
          },
        },
      }),
      db.psProposal.findMany({
        where: { orgId, engagementId: engagement.id },
        select: { title: true, status: true, currentVersion: { select: { sections: true } } },
      }),
      db.psCostEstimate.findMany({
        where: { orgId, engagementId: engagement.id },
        select: { title: true, status: true, totalAmount: true, currency: true },
      }),
      db.psTimelineEvent.findMany({
        where: { orgId, engagementId: engagement.id },
        select: { type: true, summary: true, payload: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const context: DealContext = {
      title: engagement.title,
      stage: engagement.stage,
      stageLabel: STAGE_LABEL[engagement.stage as Stage] ?? engagement.stage,
      daysInStage: engagement.daysInStage,
      industry: engagement.industry,
      territory: engagement.territory,
      competitors: engagement.competitors,
      techStack: engagement.techStack,
      probability: engagement.probability,
      estRevenueMajor:
        engagement.estRevenue === null
          ? null
          : fromMinorUnits(engagement.estRevenue.toString(), engagement.currency ?? "INR"),
      currency: engagement.currency,
      expectedClose: engagement.expectedClose,
      aiDealHealth: engagement.aiDealHealth,
      riskScore: engagement.riskScore,
      requirementBrief: rfps.find((r) => r.extractedText)?.extractedText ?? null,
      requirements: rfps.flatMap((r) => r.requirements),
      proposals: proposals.map((p) => {
        const sections = parseSections(p.currentVersion?.sections);
        return {
          title: p.title,
          status: p.status,
          sectionsFilled: sections.filter((s) => s.html.trim() !== "").length,
          sectionsTotal: sections.length,
        };
      }),
      estimates: estimates.map((e) => ({
        title: e.title,
        status: e.status,
        totalMajor: fromMinorUnits(e.totalAmount.toString(), e.currency),
        currency: e.currency,
      })),
      // Demo outcomes live on the timeline, not a relation — see the demo
      // delivery tracking route.
      demoDeliveries: events
        .filter((e) => e.type === "demo-delivered")
        .map((e) => {
          const p = (e.payload ?? {}) as Record<string, unknown>;
          return {
            title: typeof p.demoTitle === "string" ? p.demoTitle : null,
            outcome: typeof p.outcome === "string" ? p.outcome : "neutral",
            score: typeof p.feedbackScore === "number" ? p.feedbackScore : null,
          };
        }),
      recentActivity: events.slice(0, 12).map((e) => ({
        type: e.type,
        summary: e.summary,
        daysAgo: Math.max(0, Math.floor((Date.now() - e.createdAt.getTime()) / 86_400_000)),
      })),
      winLoss: engagement.winLoss,
    };

    const result = await runCopilot(task, context, question);

    await writeAudit(db, {
      orgId,
      userId,
      action: `copilot.${task}`,
      resource: engagement.id,
      metadata: {
        task,
        tokensUsed: result.tokensUsed,
        isStub: result.isStub,
        // The question text is not stored: it can contain customer-confidential
        // phrasing and the audit trail is read far more widely than the deal.
        ...(task === "ask" ? { questionLength: (question ?? "").length } : {}),
      },
    });

    return okSerialized({
      engagementId: engagement.id,
      task: result.task,
      answer: result.answer,
      isStub: result.isStub,
      /** What the answer was grounded in, so a thin answer is explainable. */
      grounding: {
        requirements: context.requirements.length,
        answeredRequirements: context.requirements.filter((r) => (r.responseText ?? "").trim() !== "")
          .length,
        proposals: context.proposals.length,
        estimates: context.estimates.length,
        demosDelivered: context.demoDeliveries.length,
        activityEvents: context.recentActivity.length,
        hasRequirementBrief: !!context.requirementBrief,
      },
    });
  },
);

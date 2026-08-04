import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { STAGE_ORDER, STAGE_LABEL, type Stage } from "@/lib/pipeline";

const withEngagementAuth = withOrgAuthForModule("engagements");

/**
 * GET /api/engagements/[id]/workspace
 *
 * Everything the deal workspace header and Overview tab need, in one request:
 * the engagement, a dated stage tracker, the latest AI assessment, related counts
 * and recent activity.
 *
 * One endpoint rather than six, because the workspace renders as a single view and
 * six parallel client requests would make it flash through six loading states.
 *
 * The stage tracker's dates are DERIVED from the timeline rather than stored:
 * `stage-advanced` events already record who moved a deal and when, so a
 * per-stage date column would be a second copy of the same fact — free to drift
 * and impossible to backfill for existing deals.
 */
export const dynamic = "force-dynamic";

interface StageStep {
  stage: string;
  label: string;
  state: "done" | "current" | "upcoming" | "skipped";
  /** When the deal entered this stage, when the timeline knows. */
  enteredAt: string | null;
}

export const GET = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "engagements", "view");
    if (denied) return denied;

    const engagement = await db.psEngagement.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        winLoss: true,
        poc: true,
        _count: {
          select: { documents: true, rfps: true, proposals: true, estimates: true, timelineEvents: true },
        },
      },
    });
    if (!engagement) return notFound("Engagement");

    const [events, documents, latestHealth] = await Promise.all([
      db.psTimelineEvent.findMany({
        where: { orgId, engagementId: engagement.id },
        select: { id: true, type: true, summary: true, actorId: true, payload: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      db.psDocument.findMany({
        where: { orgId, engagementId: engagement.id },
        select: { id: true, filename: true, category: true, status: true, blobUrl: true, version: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      db.psTimelineEvent.findFirst({
        where: { orgId, engagementId: engagement.id, type: "deal-health-assessed" },
        select: { payload: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // When each stage was entered, oldest wins — the first time a deal reached a
    // stage is the meaningful date, not a later correction.
    const enteredAt = new Map<string, string>();
    for (const event of [...events].reverse()) {
      if (event.type === "created" || event.type === "lead-submitted") {
        const first = event.type === "lead-submitted" ? "lead" : STAGE_ORDER[0];
        if (!enteredAt.has(first)) enteredAt.set(first, event.createdAt.toISOString());
      }
      if (event.type === "stage-advanced") {
        const to = (event.payload as Record<string, unknown> | null)?.toStage;
        if (typeof to === "string" && !enteredAt.has(to)) {
          enteredAt.set(to, event.createdAt.toISOString());
        }
      }
      if (event.type === "lead-accepted" && !enteredAt.has("qualification")) {
        enteredAt.set("qualification", event.createdAt.toISOString());
      }
    }

    const currentIndex = STAGE_ORDER.indexOf(engagement.stage as Stage);
    const tracker: StageStep[] = STAGE_ORDER.filter(
      // Only show the outcome the deal actually reached, not all three.
      (s) => !["won", "lost", "rejected"].includes(s) || s === engagement.stage,
    ).map((stage) => {
      const index = STAGE_ORDER.indexOf(stage);
      const date = enteredAt.get(stage) ?? null;

      let state: StageStep["state"] = "upcoming";
      if (stage === engagement.stage) state = "current";
      else if (currentIndex >= 0 && index < currentIndex) {
        // Past stages the deal never actually visited were skipped, not completed —
        // real deals routinely jump PoC or demo, and marking those green would
        // claim work that never happened.
        state = date ? "done" : "skipped";
      }

      return { stage, label: STAGE_LABEL[stage as Stage] ?? stage, state, enteredAt: date };
    });

    const healthPayload = (latestHealth?.payload ?? null) as Record<string, unknown> | null;

    return okSerialized({
      engagement: {
        ...engagement,
        estRevenue: engagement.estRevenue?.toString() ?? null,
        winLoss: engagement.winLoss
          ? { ...engagement.winLoss, dealSize: engagement.winLoss.dealSize?.toString() ?? null }
          : null,
        poc: engagement.poc
          ? { ...engagement.poc, budget: engagement.poc.budget?.toString() ?? null }
          : null,
      },
      tracker,
      /** Null until someone runs an assessment — the UI prompts rather than faking one. */
      assessment: healthPayload
        ? {
            assessedAt: latestHealth?.createdAt.toISOString() ?? null,
            health: healthPayload.health ?? null,
            riskScore: healthPayload.riskScore ?? null,
            winProbabilityPct: healthPayload.winProbabilityPct ?? null,
            rationale: healthPayload.rationale ?? null,
            risks: Array.isArray(healthPayload.risks) ? healthPayload.risks : [],
            nextActions: Array.isArray(healthPayload.nextActions) ? healthPayload.nextActions : [],
            dimensions: Array.isArray(healthPayload.dimensions) ? healthPayload.dimensions : [],
            biggestRisk: healthPayload.biggestRisk ?? null,
            recommendedNextStep: healthPayload.recommendedNextStep ?? null,
            isStub: healthPayload.isStub === true,
          }
        : null,
      documents,
      recentActivity: events.slice(0, 8).map((e) => ({
        id: e.id,
        type: e.type,
        summary: e.summary,
        actorId: e.actorId,
        createdAt: e.createdAt.toISOString(),
      })),
      counts: engagement._count,
    });
  },
);

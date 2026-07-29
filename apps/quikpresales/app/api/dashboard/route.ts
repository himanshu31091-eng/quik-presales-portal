import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, validationError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { cacheOrCompute } from "@quikit/shared/redisCache";
import { ACTIVE_STAGES, STAGE_LABEL, type Stage } from "@/lib/pipeline";

const withDashboardAuth = withOrgAuthForModule("dashboard");

const query = z.object({
  /** Trailing window for "created this period" counters. */
  days: z.coerce.number().int().min(1).max(365).default(30),
});

/**
 * Short TTL: the dashboard is the first thing users land on, so it must be
 * fast, but a stale pipeline for minutes would undermine trust in the numbers.
 * 60s is long enough to absorb a page refresh loop.
 */
const CACHE_TTL = 60;

/**
 * GET /api/dashboard — executive KPI cards, pipeline board, recent activity.
 *
 * All aggregates run in one `Promise.all` so the page is a single round trip.
 * Cached in Redis per (org, window); Redis failures fall through to a live read
 * rather than erroring the page.
 */
export const GET = withDashboardAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "dashboard", "view");
  if (denied) return denied;

  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const { days } = parsed.data;

  const data = await cacheOrCompute(`ps:dashboard:${orgId}:${days}`, CACHE_TTL, async () => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const openEngagements = { orgId, deletedAt: null, closedStatus: "open" };

    const [
      byStage,
      pipelineValue,
      wonCount,
      lostCount,
      openRfps,
      proposalsByStatus,
      demoStats,
      assetCounts,
      newThisPeriod,
      dealHealth,
      recentActivity,
      upcomingCloses,
    ] = await Promise.all([
      db.psEngagement.groupBy({
        by: ["stage"],
        where: openEngagements,
        _count: true,
        _sum: { estRevenue: true },
      }),
      db.psEngagement.aggregate({ where: openEngagements, _sum: { estRevenue: true } }),
      db.psEngagement.count({ where: { orgId, deletedAt: null, closedStatus: "won" } }),
      db.psEngagement.count({ where: { orgId, deletedAt: null, closedStatus: "lost" } }),
      db.psRfp.count({ where: { orgId, status: { notIn: ["submitted"] } } }),
      db.psProposal.groupBy({ by: ["status"], where: { orgId }, _count: true }),
      db.psDemo.aggregate({
        where: { orgId, deletedAt: null, NOT: { feedbackScore: null } },
        _avg: { feedbackScore: true },
        _count: true,
      }),
      Promise.all([
        db.psTemplate.count({ where: { orgId, deletedAt: null } }),
        db.psDemo.count({ where: { orgId, deletedAt: null } }),
        db.psKnowledgeAsset.count({ where: { orgId, deletedAt: null } }),
      ]),
      Promise.all([
        db.psEngagement.count({ where: { orgId, deletedAt: null, createdAt: { gte: since } } }),
        db.psProposal.count({ where: { orgId, createdAt: { gte: since } } }),
        db.psRfp.count({ where: { orgId, createdAt: { gte: since } } }),
      ]),
      db.psEngagement.groupBy({
        by: ["aiDealHealth"],
        where: { ...openEngagements, NOT: { aiDealHealth: null } },
        _count: true,
      }),
      db.psTimelineEvent.findMany({
        where: { orgId },
        select: {
          id: true,
          type: true,
          summary: true,
          actorId: true,
          createdAt: true,
          engagement: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      db.psEngagement.findMany({
        where: { ...openEngagements, expectedClose: { not: null, gte: new Date() } },
        select: { id: true, title: true, stage: true, estRevenue: true, expectedClose: true },
        orderBy: { expectedClose: "asc" },
        take: 8,
      }),
    ]);

    const stageMap = new Map(byStage.map((r) => [r.stage, r]));
    const [templates, demos, knowledge] = assetCounts;
    const [newEngagements, newProposals, newRfps] = newThisPeriod;

    const closed = wonCount + lostCount;

    return {
      kpis: {
        activeEngagements: byStage.reduce((sum, r) => sum + r._count, 0),
        pipelineValue: (pipelineValue._sum.estRevenue ?? 0n).toString(),
        openRfps,
        // Guard the divide — an org with no closed deals should show null, not NaN.
        winRatePct: closed > 0 ? Math.round((wonCount / closed) * 100) : null,
        demoSatisfaction: demoStats._avg.feedbackScore
          ? Number(demoStats._avg.feedbackScore.toFixed(2))
          : null,
        ratedDemos: demoStats._count,
        // The "100+ reusable assets" target from the mandate.
        reusableAssets: templates + demos + knowledge,
      },
      pipeline: ACTIVE_STAGES.map((stage) => ({
        stage,
        label: STAGE_LABEL[stage as Stage],
        count: stageMap.get(stage)?._count ?? 0,
        value: (stageMap.get(stage)?._sum.estRevenue ?? 0n).toString(),
      })),
      proposals: Object.fromEntries(proposalsByStatus.map((r) => [r.status, r._count])),
      dealHealth: Object.fromEntries(
        dealHealth.map((r) => [r.aiDealHealth ?? "unknown", r._count]),
      ),
      assets: { templates, demos, knowledge },
      thisPeriod: { days, newEngagements, newProposals, newRfps },
      upcomingCloses: upcomingCloses.map((e) => ({
        ...e,
        estRevenue: e.estRevenue?.toString() ?? null,
        expectedClose: e.expectedClose?.toISOString() ?? null,
      })),
      recentActivity: recentActivity.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });

  return okSerialized(data);
});

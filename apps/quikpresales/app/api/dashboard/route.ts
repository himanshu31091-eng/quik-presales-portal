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
      // Grouped by stage AND currency. estRevenue is an integer count of minor
      // units, so summing across currencies adds paise to cents and produces a
      // meaningless figure — the client converts each bucket before totalling.
      db.psEngagement.groupBy({
        by: ["stage", "currency"],
        where: openEngagements,
        _count: true,
        _sum: { estRevenue: true },
      }),
      db.psEngagement.groupBy({
        by: ["currency"],
        where: openEngagements,
        _sum: { estRevenue: true },
      }),
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
        // currency travels with the amount — a bare estRevenue cannot be rendered
        // or converted correctly on its own.
        select: {
          id: true,
          title: true,
          stage: true,
          estRevenue: true,
          currency: true,
          expectedClose: true,
        },
        orderBy: { expectedClose: "asc" },
        take: 8,
      }),
    ]);

    // Per stage: a total count plus one money bucket per currency present. The
    // client converts and totals, because only it knows the chosen display
    // currency.
    const stageBuckets = new Map<string, { count: number; money: { currency: string; minorUnits: string }[] }>();
    for (const row of byStage) {
      const entry = stageBuckets.get(row.stage) ?? { count: 0, money: [] };
      entry.count += row._count;
      const minor = row._sum.estRevenue;
      if (minor !== null && minor !== 0n) {
        entry.money.push({ currency: row.currency ?? "INR", minorUnits: minor.toString() });
      }
      stageBuckets.set(row.stage, entry);
    }
    const [templates, demos, knowledge] = assetCounts;
    const [newEngagements, newProposals, newRfps] = newThisPeriod;

    const closed = wonCount + lostCount;

    return {
      kpis: {
        activeEngagements: byStage.reduce((sum, r) => sum + r._count, 0),
        // One bucket per currency in the open pipeline. The client converts these
        // into the display currency it is showing; there is no single correct
        // scalar to send here.
        pipelineByCurrency: pipelineValue
          .filter((r) => r._sum.estRevenue !== null && r._sum.estRevenue !== 0n)
          .map((r) => ({
            currency: r.currency ?? "INR",
            minorUnits: (r._sum.estRevenue ?? 0n).toString(),
          })),
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
        count: stageBuckets.get(stage)?.count ?? 0,
        money: stageBuckets.get(stage)?.money ?? [],
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
